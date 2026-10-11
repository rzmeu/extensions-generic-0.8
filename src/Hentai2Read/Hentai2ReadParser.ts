import entities = require('entities')
import {Chapter, ChapterDetails, PagedResults, SourceManga, Tag, TagSection} from "@paperback/types";
import {PartialSourceManga} from "@paperback/types/src/generated/_exports";
import * as cheerio from 'cheerio';

export class Hentai2ReadParser {
    domain: string

    constructor(domain: string) {
        this.domain = domain
    }

    parsePagedResult = (data: string| undefined, page: number): PagedResults => {
        const mangaTiles: PartialSourceManga[] = []
        const $ = cheerio.load(data!)
        for(const obj of $('article[data-card][data-book]').toArray()) {
            const link = $('a[href^="/original/"], a[href^="/doujinshi/"], a[href^="/imageset/"]', obj).first()
            const id = link.attr('href')?.replace(/^\//, '')
            const image = $('img', obj).first().attr('src')
            const title = this.decodeHTMLEntity($('h3', obj).first().text().trim() || $('img', obj).first().attr('alt') || '')

            if(!image || !id || !title) continue

            mangaTiles.push(App.createPartialSourceManga({
                mangaId: id,
                image: image,
                title: title
            }))
        }

        const hasNextPage = $(`a[href$="page-${page + 1}"], a[href*="page=${page + 1}"]`).length > 0

        return App.createPagedResults({
            results: mangaTiles,
            metadata: hasNextPage ? {nextPage: page + 1} : undefined
        })
    }

    protected decodeHTMLEntity(str: string): string {
        return entities.decodeHTML(str)
    }

    private getPageProps($: cheerio.CheerioAPI, component: string): any | undefined {
        for (const scriptObj of $('script').toArray()) {
            const script = $(scriptObj).html()?.trim()
            if (!script?.startsWith('{')) continue
            try {
                const pageData = JSON.parse(script)
                if (pageData.component === component) return pageData.props
            } catch (_) {}
        }
        return undefined
    }

    parseMangaDetails(data: string | undefined, mangaId: string, source: any): SourceManga {
        const titles: string[] = []
        const $ = cheerio.load(data!)
        const props = this.getPageProps($, 'Book/Show')
        const book = props?.book

        titles.push(this.decodeHTMLEntity(book?.title || $('main h1').first().text().trim()))
        const image = book?.cover || $('main img[alt^="Cover of "]').first().attr('src')
        //
        const arrayTags: Tag[] = []
        //
        const contentTags = book?.tags?.filter((tag: any) => tag.type === 'content') || []
        for (const tag of contentTags) {
            const label = tag.name
            const id = String(tag.id)

            if (!id || !label) continue
            arrayTags.push({ id: id, label: label })
        }
        const tagSections: TagSection[] = [App.createTagSection({ id: '0', label: 'genres', tags: arrayTags.map(x => App.createTag(x)) })]

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles: titles,
                image: image ? image : source.fallbackImage,
                status: book?.status?.label || ($('main a[href$="/ongoing"]').length ? 'Ongoing' : 'Completed'),
                tags: tagSections,
                desc: book?.description || book?.facts || '',
            })
        })
    }

    parseChapters(data: string | undefined, _mangaId: string): Chapter[] {
        const $ = cheerio.load(data!)

        const chapters: Chapter[] = []
        const langCode = "ENG"
        const props = this.getPageProps($, 'Book/Show')

        if (Array.isArray(props?.chapters)) {
            return props.chapters.slice().reverse().map((chapter: any, index: number) => App.createChapter({
                id: String(chapter.id),
                sortingIndex: index,
                name: this.decodeHTMLEntity(chapter.title || `Chapter ${chapter.number}`),
                langCode: langCode,
                chapNum: parseFloat(chapter.number) || index + 1,
                time: chapter.date ? new Date(chapter.date) : new Date(),
                volume: 0,
                group: ''
            }))
        }

        let index = 0;
        const seen = new Set<string>()
        for(const link of $('main a[href^="/reader/"][href$="/page-1"]').toArray()) {
            const href = $(link).attr('href') || ''
            const chapterId = href.match(/\/(\d+)\/page-1$/)?.[1]
            if (!chapterId || seen.has(chapterId)) continue
            seen.add(chapterId)
            const row = $(link).closest('li, article, div').first()
            const chapterName = this.decodeHTMLEntity($(link).text().trim())
            const chapterNumber = parseFloat(row.find('[class*="tabular-nums"]').first().text().trim()) || parseFloat(chapterName.match(/(?:chapter\s*)?(\d+(?:\.\d+)?)/i)?.[1] || '') || index + 1
            const dateText = row.find('time').attr('datetime') || row.find('time').text().trim()
            chapters.push(App.createChapter({
                id: chapterId,
                sortingIndex: index,
                name: chapterName,
                langCode: langCode,
                chapNum: chapterNumber,
                time: dateText ? new Date(dateText) : new Date(),
                volume: 0,
                group: ''
            }))

            index++;
        }

        chapters.reverse()
        chapters.forEach((chapter, chapterIndex) => chapter.sortingIndex = chapterIndex)
        return chapters
    }

    parseChapterUploadDate(uploadedDateText: string): Date {
        if (uploadedDateText.includes('hour')) {
            const now = new Date()
            now.setHours(now.getHours() - parseInt(uploadedDateText.split('hour')[0]!))
            return now
        } else if (uploadedDateText.includes('day')) {
            const now = new Date()
            now.setDate(now.getDate() - parseInt(uploadedDateText.split('day')[0]!))
            return now
        } else if (uploadedDateText.includes('week')) {
            const now = new Date()
            now.setDate(now.getDate() - parseInt(uploadedDateText.split('week')[0]!) * 7)
            return now
        } else if (uploadedDateText.includes('month')) {
            const now = new Date()
            now.setMonth(now.getMonth() - parseInt(uploadedDateText.split('month')[0]!))
            return now
        } else if (uploadedDateText.includes('year')) {
            const now = new Date()
            now.setFullYear(now.getFullYear() - parseInt(uploadedDateText.split('year')[0]!))
            return now
        }

        return new Date()
    }

    async parseChapterDetails(data: string | undefined, mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const $ = cheerio.load(data!)
        let images: string[] = []
        const props = this.getPageProps($, 'Reader/Show')
        if (Array.isArray(props?.images)) images = props.images

        return App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: images
        })
    }

    parseTags(data: string | undefined): TagSection[] {
        const $ = cheerio.load(data!)
        const tags: Tag[] = []
        const seen = new Set<string>()

        for (const link of $('a[href^="/content/"], a[href^="/category/"]').toArray()) {
            const href = $(link).attr('href') || ''
            const id = href.match(/^\/(?:content|category)\/(\d+)/)?.[1]
            const label = $(link).text().trim()
            if (!id || !label || seen.has(id)) continue
            seen.add(id)
            tags.push(App.createTag({id, label: this.decodeHTMLEntity(label)}))
        }

        return [App.createTagSection({id: '0', label: 'genres', tags})]
    }

    getTags(): TagSection[] {
        const arrayTags: Tag[] = [
            {id: '128', label: 'Abortion'},
            {id: '496', label: 'Absent Parents'},
            {id: '561', label: 'Abusive'},
            {id: '203', label: 'Abusive Lover'},
            {id: '89', label: 'Adapted to H-Anime'},
            {id: '501', label: 'Addiction'},
            {id: '578', label: 'Adopted Sister'},
            {id: '127', label: 'Adoption'},
            {id: '510', label: 'Adoptive Siblings'},
            {id: '166', label: 'Adultery'},
            {id: '512', label: 'Affair'},
            {id: '567', label: 'Aggressive Lover'},
            {id: '614', label: 'Ahegao'},
            {id: '699', label: 'Airheads'},
            {id: '56', label: 'All-Girls School'},
            {id: '170', label: 'Alternative Ending'},
            {id: '462', label: 'Anal Play'},
            {id: '1177', label: 'Analingus (Rimjob)'},
            {id: '322', label: 'Angels'},
            {id: '785', label: 'Animal Girls'},
            {id: '178', label: 'Animal Transformation'},
            {id: '150', label: 'Anthology'},
            {id: '209', label: 'Anthropomorphism'},
            {id: '248', label: 'Apron'},
            {id: '1239', label: 'Armpit Licking'},
            {id: '726', label: 'Armpit Sex'},
            {id: '198', label: 'Arranged Marriage'},
            {id: '624', label: 'Artificial Intelligence'},
            {id: '1069', label: 'Assjob'},
            {id: '43', label: 'Aunt-Nephew Relationship'},
            {id: '589', label: 'Aunts'},
            {id: '711', label: 'Authority Figures'},
            {id: '1067', label: 'Bad Grammar'},
            {id: '57', label: 'Bathroom Intercourse'},
            {id: '748', label: 'BBW'},
            {id: '194', label: 'BDSM'},
            {id: '83', label: 'Beach'},
            {id: '396', label: 'Best Friends'},
            {id: '71', label: 'Bestiality'},
            {id: '155', label: 'Betrayal'},
            {id: '562', label: 'Big Ass'},
            {id: '532', label: 'Bikini'},
            {id: '160', label: 'Bishoujo'},
            {id: '502', label: 'Bittersweet Ending'},
            {id: '77', label: 'Blackmail'},
            {id: '756', label: 'Blind Characters'},
            {id: '371', label: 'Blindfold'},
            {id: '505', label: 'Bloomers'},
            {id: '238', label: 'Blow job'},
            {id: '1421', label: 'Blowjob Face'},
            {id: '659', label: 'Body Modification'},
            {id: '105', label: 'Body Swap'},
            {id: '1062', label: 'Body Writing'},
            {id: '1649', label: 'Bodysuit'},
            {id: '41', label: 'Bondage'},
            {id: '80', label: 'Borderline H'},
            {id: '444', label: 'Brainwash'},
            {id: '1070', label: 'Breast Expansion'},
            {id: '459', label: 'Brides'},
            {id: '435', label: 'Brother and Sister'},
            {id: '144', label: 'Brother Complex'},
            {id: '679', label: 'Brother-in-law'},
            {id: '414', label: 'BSDM'},
            {id: '138', label: 'Bukkake'},
            {id: '152', label: 'Bullying'},
            {id: '395', label: 'Bunny Girls'},
            {id: '1607', label: 'Cannibalism'},
            {id: '577', label: 'Cat Ears'},
            {id: '242', label: 'Cat Girls'},
            {id: '51', label: 'Caught in the Act'},
            {id: '381', label: 'Censored'},
            {id: '1063', label: 'Cervix Penetration'},
            {id: '531', label: 'CGs'},
            {id: '137', label: 'Character Who Bullies the One They Love'},
            {id: '58', label: 'Cheating'},
            {id: '455', label: 'Cheerleaders'},
            {id: '1650', label: 'Chikan'},
            {id: '734', label: 'Child Abuse'},
            {id: '145', label: 'Child Born From Incest'},
            {id: '35', label: 'Childhood Friends'},
            {id: '36', label: 'Childhood Love'},
            {id: '1223', label: 'Chinese Dress'},
            {id: '709', label: 'Chubby'},
            {id: '560', label: 'Club President'},
            {id: '700', label: 'Clumsy Character'},
            {id: '642', label: 'Co-workers'},
            {id: '88', label: 'Collection of Inter-Linked Stories'},
            {id: '59', label: 'Collection of Short Stories/Oneshots'},
            {id: '196', label: 'Confession'},
            {id: '183', label: 'Corruption'},
            {id: '74', label: 'Cosplay'},
            {id: '456', label: 'Cousins'},
            {id: '466', label: 'Cow Girls'},
            {id: '290', label: 'Creampie'},
            {id: '53', label: 'Crossdressing'},
            {id: '654', label: 'Cunnilingus'},
            {id: '762', label: 'Dakara Boku wa H ga Dekinai'},
            {id: '422', label: 'Dark Skin'},
            {id: '461', label: 'Debt-Motivated Prostitution'},
            {id: '362', label: 'Debts'},
            {id: '124', label: 'Deception'},
            {id: '499', label: 'Deep Throat'},
            {id: '406', label: 'Defloration'},
            {id: '173', label: 'Delinquents'},
            {id: '511', label: 'Demon Girls'},
            {id: '592', label: 'Demon Hunters'},
            {id: '361', label: 'Demons'},
            {id: '205', label: 'Doctor-Patient Relationship'},
            {id: '60', label: 'Dog Girls'},
            {id: '94', label: 'Double Penetration'},
            {id: '106', label: 'Drugs'},
            {id: '199', label: 'Drunk'},
            {id: '101', label: 'Drunk Intercourse'},
            {id: '465', label: 'Elf-Elves'},
            {id: '1191', label: 'Emotionless Sex'},
            {id: '643', label: 'Enema Play'},
            {id: '188', label: 'Enemies Become Lovers'},
            {id: '31', label: 'Ero-Guro'},
            {id: '84', label: 'Exhibitionism'},
            {id: '716', label: 'Facesitting'},
            {id: '464', label: 'Fairy-Fairies'},
            {id: '573', label: 'Family Love'},
            {id: '576', label: 'Family Secrets'},
            {id: '278', label: 'Father and Daughter'},
            {id: '803', label: 'Father-in-Law'},
            {id: '42', label: 'Female Dominance'},
            {id: '286', label: 'Fetish'},
            {id: '647', label: 'Fight Between Lovers'},
            {id: '474', label: 'Fingering'},
            {id: '171', label: 'First Love'},
            {id: '95', label: 'Fisting'},
            {id: '303', label: 'Foot job'},
            {id: '1384', label: 'Foot Licking'},
            {id: '648', label: 'Forced into a Relationship'},
            {id: '574', label: 'Forced Marriage'},
            {id: '443', label: 'Forced Sex'},
            {id: '44', label: 'Foursome'},
            {id: '418', label: 'Fox Girls'},
            {id: '667', label: 'Friends Become Lovers'},
            {id: '114', label: 'Full Color'},
            {id: '1194', label: 'Furry'},
            {id: '1188', label: 'Futa on Female'},
            {id: '732', label: 'Futa on Male'},
            {id: '96', label: 'Gang Rape'},
            {id: '112', label: 'Gangbang'},
            {id: '177', label: 'Ganguro'},
            {id: '11', label: 'Gender Bender'},
            {id: '1620', label: 'Ghost'},
            {id: '1157', label: 'Giantess'},
            {id: '839', label: 'Girls Only'},
            {id: '113', label: 'Glasses'},
            {id: '179', label: 'God-Human Relationship'},
            {id: '438', label: 'Goddess'},
            {id: '37', label: 'Group Intercourse'},
            {id: '1064', label: 'Gyaru'},
            {id: '1238', label: 'Hairy Armpit'},
            {id: '133', label: 'Hand Job'},
            {id: '118', label: 'Happy Sex'},
            {id: '477', label: 'Hardcore'},
            {id: '524', label: 'Harem-seeking Male Lead'},
            {id: '646', label: 'Hot Springs'},
            {id: '141', label: 'Housewife-Housewives'},
            {id: '735', label: 'Human Pet'},
            {id: '629', label: 'Human Toilets'},
            {id: '109', label: 'Human-Nonhuman Relationship'},
            {id: '139', label: 'Humiliation'},
            {id: '636', label: 'Hypnotism'},
            {id: '390', label: 'Idols'},
            {id: '460', label: 'Impregnation'},
            {id: '182', label: 'Incest as a Subplot'},
            {id: '92', label: 'Infidelity'},
            {id: '1065', label: 'Inflation'},
            {id: '1640', label: 'Insect'},
            {id: '97', label: 'Inverted Nipples'},
            {id: '1527', label: 'Isekai (Otherworld)'},
            {id: '103', label: 'Jealous Lover'},
            {id: '45', label: 'Jealousy'},
            {id: '86', label: 'Kidnapping'},
            {id: '427', label: 'Kimono'},
            {id: '658', label: 'Kunoichi (Ninja Girls)'},
            {id: '5', label: 'Lactation'},
            {id: '258', label: 'Large Dicks'},
            {id: '1066', label: 'Leotard'},
            {id: '46', label: 'Lingerie'},
            {id: '556', label: 'Little Sisters'},
            {id: '669', label: 'Live-in Lover'},
            {id: '1630', label: 'Lizard Girl'},
            {id: '446', label: 'Love At First Sight'},
            {id: '525', label: 'Love Rivals'},
            {id: '366', label: 'Love Triangles'},
            {id: '134', label: 'Magic'},
            {id: '142', label: 'Magical Girls'},
            {id: '208', label: 'Maids'},
            {id: '174', label: 'Male Dominance'},
            {id: '165', label: 'Mangaka'},
            {id: '167', label: 'Masochists'},
            {id: '204', label: 'Master-Pet Relationship'},
            {id: '110', label: 'Master-Servant Relationship'},
            {id: '76', label: 'Master-Slave Relationship'},
            {id: '7', label: 'Masturbation'},
            {id: '620', label: 'Mermaids'},
            {id: '61', label: 'MILFs'},
            {id: '32', label: 'Mind Break'},
            {id: '33', label: 'Mind Control'},
            {id: '338', label: 'Molesters'},
            {id: '486', label: 'Monster Girls'},
            {id: '403', label: 'Monster Sex'},
            {id: '369', label: 'Monsters'},
            {id: '1646', label: 'Moral Degeneration'},
            {id: '185', label: 'Mother and Daughter'},
            {id: '78', label: 'Mother and Son'},
            {id: '52', label: 'Mother Complex'},
            {id: '621', label: 'Mother-in-Law'},
            {id: '713', label: 'Multiple Penetration'},
            {id: '1591', label: 'Necrophilia'},
            {id: '644', label: 'Neighbors'},
            {id: '69', label: 'Netorare'},
            {id: '1122', label: 'Netori'},
            {id: '108', label: 'Newlyweds'},
            {id: '622', label: 'Nipple Intercourse'},
            {id: '233', label: 'Nipple Play'},
            {id: '1382', label: 'No Penetration'},
            {id: '111', label: 'Non-Human Pregnancy'},
            {id: '374', label: 'Nuns'},
            {id: '296', label: 'Nurses'},
            {id: '153', label: 'Obsessive Love'},
            {id: '641', label: 'Office Ladies'},
            {id: '1639', label: 'Old Lady'},
            {id: '1210', label: 'Old Man'},
            {id: '463', label: 'Older Brother'},
            {id: '584', label: 'Older Female Young Boy'},
            {id: '62', label: 'Older Female Younger Male'},
            {id: '397', label: 'Older Male Younger Female'},
            {id: '401', label: 'Older Sister'},
            {id: '121', label: 'Outdoor Intercourse'},
            {id: '63', label: 'Paizuri'},
            {id: '421', label: 'Pantyhose'},
            {id: '1182', label: 'Partial Censorship'},
            {id: '169', label: 'Partially Colored'},
            {id: '640', label: 'Pegging'},
            {id: '146', label: 'Personality Change'},
            {id: '75', label: 'Perverted Boss'},
            {id: '29', label: 'Perverted Characters'},
            {id: '65', label: 'Perverted Teachers'},
            {id: '536', label: 'Perverts'},
            {id: '1648', label: 'Petplay'},
            {id: '448', label: 'Pets'},
            {id: '515', label: 'Piercings'},
            {id: '588', label: 'Plain Girls'},
            {id: '175', label: 'Plastic Surgery'},
            {id: '38', label: 'Polygamy'},
            {id: '441', label: 'Poor Characters'},
            {id: '1161', label: 'Poor Grammar'},
            {id: '503', label: 'Porn Industry'},
            {id: '66', label: 'Porn Stars'},
            {id: '129', label: 'Porn with Plot'},
            {id: '587', label: 'Possessed'},
            {id: '172', label: 'Possession'},
            {id: '568', label: 'Possessive Lover'},
            {id: '34', label: 'Pregnancy'},
            {id: '543', label: 'Pretend Rape'},
            {id: '590', label: 'Priestesses'},
            {id: '357', label: 'Priests'},
            {id: '364', label: 'Princes'},
            {id: '365', label: 'Princesses'},
            {id: '157', label: 'Prisoners'},
            {id: '570', label: 'Proactive Protagonist'},
            {id: '537', label: 'Producers'},
            {id: '79', label: 'Prostitution'},
            {id: '123', label: 'Public Intercourse'},
            {id: '85', label: 'Public Nudity'},
            {id: '493', label: 'Punishment'},
            {id: '187', label: 'Punishment Sex'},
            {id: '498', label: 'Queens'},
            {id: '115', label: 'Rabbit Girls'},
            {id: '143', label: 'Reverse Harem'},
            {id: '72', label: 'Reverse Rape'},
            {id: '1160', label: 'Rewrite'},
            {id: '180', label: 'Rich Boy'},
            {id: '181', label: 'Rich Family'},
            {id: '67', label: 'Rich Girl'},
            {id: '14', label: 'Robotics'},
            {id: '1651', label: 'Rough Grammar'},
            {id: '122', label: 'Rushed Ending/Axed'},
            {id: '168', label: 'Sadist'},
            {id: '119', label: 'Sadomasochism'},
            {id: '98', label: 'Scat'},
            {id: '262', label: 'School Girls'},
            {id: '39', label: 'School Intercourse'},
            {id: '117', label: 'School Nurse-Student Relationship'},
            {id: '526', label: 'Secret Crush'},
            {id: '81', label: 'Secret Relationship'},
            {id: '549', label: 'Seduction'},
            {id: '104', label: 'Senpai-Kouhai Relationship'},
            {id: '30', label: 'Sex Addicts'},
            {id: '158', label: 'Sex Friends'},
            {id: '82', label: 'Sex Friends Become Lovers'},
            {id: '107', label: 'Sex Industry'},
            {id: '420', label: 'Sex Slaves'},
            {id: '197', label: 'Sex Toys'},
            {id: '176', label: 'Sexual Abuse'},
            {id: '116', label: 'Sexual Assault'},
            {id: '572', label: 'Sexual Frustration'},
            {id: '1204', label: 'Shemale'},
            {id: '162', label: 'Shy Characters'},
            {id: '164', label: 'Sibling Love'},
            {id: '482', label: 'Sister and Brother'},
            {id: '102', label: 'Sister Complex'},
            {id: '1561', label: 'Sister-in-Law'},
            {id: '449', label: 'Sisters'},
            {id: '190', label: 'Sketchy Art Style'},
            {id: '1606', label: 'Skinsuit'},
            {id: '148', label: 'Sleep Intercourse'},
            {id: '469', label: 'Sluts'},
            {id: '99', label: 'Small Breasts'},
            {id: '207', label: 'Son Complex'},
            {id: '472', label: 'Spirits'},
            {id: '1645', label: 'Squirting'},
            {id: '457', label: 'Star-Crossed Lover/s'},
            {id: '130', label: 'Step-Daughter'},
            {id: '131', label: 'Step-Father'},
            {id: '132', label: 'Step-Father/Step-Daughter Relationship'},
            {id: '184', label: 'Step-Mother'},
            {id: '47', label: 'Step-Mother/Step-Son Relationship'},
            {id: '70', label: 'Step-Sibling Love'},
            {id: '126', label: 'Step-Siblings'},
            {id: '195', label: 'Step-Son'},
            {id: '447', label: 'Stockings'},
            {id: '159', label: 'Student Council'},
            {id: '40', label: 'Student-Tutor Relationship'},
            {id: '73', label: 'Succubus'},
            {id: '154', label: 'Sudden Appearance'},
            {id: '93', label: 'Sudden Confession'},
            {id: '372', label: 'Swimsuit/s'},
            {id: '1571', label: 'Swinging'},
            {id: '521', label: 'Tanned'},
            {id: '348', label: 'Teacher-Student Relationship'},
            {id: '68', label: 'Teacher-Teacher Relationship'},
            {id: '473', label: 'Teachers'},
            {id: '10', label: 'Tentacles'},
            {id: '604', label: 'Threesome (MFF)'},
            {id: '605', label: 'Threesome (MMF)'},
            {id: '48', label: 'Threesome (Other)'},
            {id: '1179', label: 'Time Stop'},
            {id: '161', label: 'Tomboy'},
            {id: '1068', label: 'Torture'},
            {id: '125', label: 'Transgender'},
            {id: '54', label: 'Trap'},
            {id: '140', label: 'Tribadism'},
            {id: '163', label: 'Tsundere'},
            {id: '151', label: 'Tutors'},
            {id: '147', label: 'Twincest'},
            {id: '49', label: 'Twins'},
            {id: '804', label: 'Uncle and Niece'},
            {id: '87', label: 'Unlucky Character/s'},
            {id: '428', label: 'Unrequited Love'},
            {id: '1192', label: 'Unusual Pupils'},
            {id: '363', label: 'Urethral Intercourse'},
            {id: '191', label: 'Urethral Play'},
            {id: '100', label: 'Urination'},
            {id: '354', label: 'Vampires'},
            {id: '355', label: 'Virgins'},
            {id: '149', label: 'Virtual Reality'},
            {id: '724', label: 'Vore'},
            {id: '64', label: 'Voyeurism'},
            {id: '451', label: 'Waitresses'},
            {id: '1476', label: 'Webtoon'},
            {id: '202', label: 'Werewolf'},
            {id: '135', label: 'Widow'},
            {id: '156', label: 'Wife Corruption'},
            {id: '136', label: 'Wife Depravity'},
            {id: '471', label: 'Wife-Wives'},
            {id: '523', label: 'Witches'},
            {id: '489', label: 'Wolf Girls'},
            {id: '310', label: 'X-Ray'},
            {id: '201', label: 'Yandere'},
            {id: '285', label: 'Youkai'},
            {id: '120', label: 'Young Master'},
            {id: '1221', label: 'Yuri as a Subplot'},
            {id: '1549', label: 'Zombies'},
        ]

        return [App.createTagSection({ id: '0', label: 'genres', tags: arrayTags.map(x => App.createTag(x)) })]
    }
}
