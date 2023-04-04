import entities = require('entities')
import {Chapter, ChapterDetails, PagedResults, SourceManga, Tag, TagSection} from "@paperback/types";
import {PartialSourceManga} from "@paperback/types/src/generated/_exports";

export class Hentai2ReadParser {
    cheerio: CheerioAPI;
    domain: string

    constructor(cheerio: CheerioAPI, domain: string) {
        this.cheerio = cheerio
        this.domain = domain
    }

    parsePagedResult = (data: string| undefined, page: number): PagedResults => {
        const mangaTiles: PartialSourceManga[] = []
        const $ = this.cheerio.load(data!)


        for(const obj of $('div.row.book-grid > div.col-xs-6.col-sm-4.col-md-3.col-xl-2').toArray()) {
            const id = $('a.title', obj).attr('href')!.replace(this.domain, '').replaceAll('/', '')
            const image = $('picture>img', obj).attr('data-src')!.replace('/cdn-cgi/image/format=auto/', '')
            const title = this.decodeHTMLEntity($('a.title > span.title-text', obj).text())

            mangaTiles.push(App.createPartialSourceManga({
                mangaId: id,
                image: image,
                title: title
            }))
        }

        let mData
        if (mangaTiles.length < 48) {
            mData = undefined
        } else {
            mData = {nextPage: page + 1}
        }

        return App.createPagedResults({
            results: mangaTiles,
            metadata: mData
        })
    }

    protected decodeHTMLEntity(str: string): string {
        return entities.decodeHTML(str)
    }

    parseMangaDetails(data: string | undefined, mangaId: string, source: any): SourceManga {
        const titles: string[] = []
        const $ = this.cheerio.load(data!)

        titles.push(this.decodeHTMLEntity($('h3.block-title > a').text()))
        //
        const image = $('div.img-container img').attr('src')
        //
        const arrayTags: Tag[] = []
        //
        const tagsParent = $('ul.list.list-simple-mini > li > b:contains(Content)').parent()
        const tags = this.getTags()[0]!.tags

        for (const tag of $('a', tagsParent).toArray()) {
            const label = $(tag).text().trim()
            const optionalTag = tags.find(value => value.label === label)
            const id = (optionalTag != undefined ? optionalTag.id : encodeURI(label))

            if (!id || !label) continue
            arrayTags.push({ id: id, label: label })
        }
        const tagSections: TagSection[] = [App.createTagSection({ id: '0', label: 'genres', tags: arrayTags.map(x => App.createTag(x)) })]

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles: titles,
                image: image ? image : source.fallbackImage,
                status: 'Completed',
                tags: tagSections,
                desc: '',
            })
        })
    }

    parseChapters(data: string | undefined, mangaId: string): Chapter[] {
        const $ = this.cheerio.load(data!)

        const chapters: Chapter[] = []
        const langCode = "ENG"

        var index = 0;
        for(const obj of $('ul.nav-chapters > li').toArray()) {
            const chapterId = $('div.media > a', obj).attr('href')!.replace(this.domain, '').replace(mangaId, '').replaceAll('/', '')
            const chapterNameText = $('div.media > a', obj).text()
            const chapterNameCleanup = chapterNameText.replaceAll('\n', '')
            const chapterNameWithoutNumber = chapterNameCleanup.replace(chapterId + ' - ', '')
            const chapterNameArr = chapterNameWithoutNumber.split(' uploaded by ')
            const chapterName = this.decodeHTMLEntity(chapterNameArr[0]!)

            const uploadedDateText = chapterNameArr[1]!.split(' about ')[1]!.replace(' ago', '')


            chapters.push(App.createChapter({
                id: chapterId,
                sortingIndex: index,
                name: chapterName,
                langCode: langCode,
                chapNum: parseInt(chapterId),
                time: this.parseChapterUploadDate(uploadedDateText),
                volume: 0,
                group: ''
            }))

            index++;
        }

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
        const $ = this.cheerio.load(data!)
        let images = []

        for (const scriptObj of $('script').toArray()) {
            if($(scriptObj).html() != undefined && $(scriptObj).html()!.includes('gData')) {
                const gData = $(scriptObj).html()
                const gDataClean: string = gData?.replace(/[\s\S]*var gData = /, '').replace(/;/g, '').replace(/'/g, '"') || ''
                const gDataJson = JSON.parse(gDataClean)
                images = gDataJson.images.map((el: string) => `https://cdn-ngocok-static.sinxdr.workers.dev/hentai${el}`)
            }
        }

        return App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: images
        })
    }

    getTags(): TagSection[] {
        const arrayTags: Tag[] = [
            {id: '529', label: 'Abortion'},
            {id: '1423', label: 'Absent Parents'},
            {id: '878', label: 'Abusive Lover'},
            {id: '1587', label: 'Abusive'},
            {id: '416', label: 'Adapted to H-Anime'},
            {id: '1438', label: 'Addiction'},
            {id: '1634', label: 'Adopted Sister'},
            {id: '522', label: 'Adoption'},
            {id: '1451', label: 'Adoptive Siblings'},
            {id: '661', label: 'Adultery'},
            {id: '1459', label: 'Affair'},
            {id: '1599', label: 'Aggressive Lover'},
            {id: '1702', label: 'Ahegao'},
            {id: '1807', label: 'Airheads'},
            {id: '347', label: 'All-Girls School'},
            {id: '666', label: 'Alternative Ending'},
            {id: '1365', label: 'Anal Play'},
            {id: '2298', label: 'Analingus (Rimjob)'},
            {id: '1093', label: 'Angels'},
            {id: '1904', label: 'Animal Girls'},
            {id: '710', label: 'Animal Transformation'},
            {id: '589', label: 'Anthology'},
            {id: '913', label: 'Anthropomorphism'},
            {id: '975', label: 'Apron'},
            {id: '2360', label: 'Armpit Licking'},
            {id: '1843', label: 'Armpit Sex'},
            {id: '846', label: 'Arranged Marriage'},
            {id: '1719', label: 'Artificial Intelligence'},
            {id: '2190', label: 'Assjob'},
            {id: '327', label: 'Aunt-Nephew Relationship'},
            {id: '1661', label: 'Aunts'},
            {id: '1821', label: 'Authority Figures'},
            {id: '2188', label: 'Bad Grammar'},
            {id: '350', label: 'Bathroom Intercourse'},
            {id: '1867', label: 'BBW'},
            {id: '831', label: 'BDSM'},
            {id: '403', label: 'Beach'},
            {id: '1227', label: 'Best Friends'},
            {id: '372', label: 'Bestiality'},
            {id: '610', label: 'Betrayal'},
            {id: '1591', label: 'Big Ass'},
            {id: '1514', label: 'Bikini'},
            {id: '645', label: 'Bishoujo'},
            {id: '1439', label: 'Bittersweet Ending'},
            {id: '391', label: 'Blackmail'},
            {id: '1875', label: 'Blind Characters'},
            {id: '1177', label: 'Blindfold'},
            {id: '1444', label: 'Bloomers'},
            {id: '952', label: 'Blow job'},
            {id: '2542', label: 'Blowjob Face'},
            {id: '1760', label: 'Body Modification'},
            {id: '444', label: 'Body Swap'},
            {id: '2183', label: 'Body Writing'},
            {id: '317', label: 'Bondage'},
            {id: '395', label: 'Borderline H'},
            {id: '1321', label: 'Brainwash'},
            {id: '2191', label: 'Breast Expansion'},
            {id: '1351', label: 'Brides'},
            {id: '1305', label: 'Brother and Sister'},
            {id: '574', label: 'Brother Complex'},
            {id: '1782', label: 'Brother-in-law'},
            {id: '551', label: 'Bukkake'},
            {id: '600', label: 'Bullying'},
            {id: '1226', label: 'Bunny Girls'},
            {id: '1633', label: 'Cat Ears'},
            {id: '957', label: 'Cat Girls'},
            {id: '339', label: 'Caught in the Act'},
            {id: '1196', label: 'Censored'},
            {id: '2184', label: 'Cervix Penetration'},
            {id: '1512', label: 'CGs'},
            {id: '549', label: 'Character Who Bullies the One They Love'},
            {id: '351', label: 'Cheating'},
            {id: '1339', label: 'Cheerleaders'},
            {id: '1852', label: 'Child Abuse'},
            {id: '575', label: 'Child Born From Incest'},
            {id: '1663', label: 'Child Prostitute'},
            {id: '309', label: 'Childhood Friends'},
            {id: '310', label: 'Childhood Love'},
            {id: '2344', label: 'Chinese Dress'},
            {id: '1819', label: 'Chubby'},
            {id: '1586', label: 'Club President'},
            {id: '1808', label: 'Clumsy Character'},
            {id: '1739', label: 'Co-workers'},
            {id: '415', label: 'Collection of Inter-Linked Stories'},
            {id: '352', label: 'Collection of Short Stories/Oneshots'},
            {id: '834', label: 'Confession'},
            {id: '755', label: 'Corruption'},
            {id: '379', label: 'Cosplay'},
            {id: '1340', label: 'Cousins'},
            {id: '1371', label: 'Cow Girls'},
            {id: '1037', label: 'Creampie'},
            {id: '343', label: 'Crossdressing'},
            {id: '1754', label: 'Cunnilingus'},
            {id: '1277', label: 'Dark Skin'},
            {id: '1364', label: 'Debt-Motivated Prostitution'},
            {id: '1154', label: 'Debts'},
            {id: '516', label: 'Deception'},
            {id: '1436', label: 'Deep Throat'},
            {id: '1246', label: 'Defloration'},
            {id: '680', label: 'Delinquents'},
            {id: '1453', label: 'Demon Girls'},
            {id: '1666', label: 'Demon Hunters'},
            {id: '1152', label: 'Demons'},
            {id: '900', label: 'Doctor-Patient Relationship'},
            {id: '353', label: 'Dog Girls'},
            {id: '427', label: 'Double Penetration'},
            {id: '446', label: 'Drugs'},
            {id: '438', label: 'Drunk Intercourse'},
            {id: '864', label: 'Drunk'},
            {id: '1370', label: 'Elf-Elves'},
            {id: '2312', label: 'Emotionless Sex'},
            {id: '1740', label: 'Enema Play'},
            {id: '803', label: 'Enemies Become Lovers'},
            {id: '302', label: 'Ero-Guro'},
            {id: '404', label: 'Exhibitionism'},
            {id: '1831', label: 'Facesitting'},
            {id: '1368', label: 'Fairy-Fairies'},
            {id: '1616', label: 'Family Love'},
            {id: '1623', label: 'Family Secrets'},
            {id: '1021', label: 'Father and Daughter'},
            {id: '1922', label: 'Father-in-Law'},
            {id: '320', label: 'Female Dominance'},
            {id: '1030', label: 'Fetish'},
            {id: '1745', label: 'Fight Between Lovers'},
            {id: '1389', label: 'Fingering'},
            {id: '670', label: 'First Love'},
            {id: '428', label: 'Fisting'},
            {id: '1058', label: 'Foot job'},
            {id: '2505', label: 'Foot Licking'},
            {id: '1746', label: 'Forced into a Relationship'},
            {id: '1617', label: 'Forced Marriage'},
            {id: '1320', label: 'Forced Sex'},
            {id: '330', label: 'Foursome'},
            {id: '1268', label: 'Fox Girls'},
            {id: '1769', label: 'Friends Become Lovers'},
            {id: '468', label: 'Full Color'},
            {id: '2315', label: 'Furry'},
            {id: '2309', label: 'Futa on Female'},
            {id: '1850', label: 'Futa on Male'},
            {id: '429', label: 'Gang Rape'},
            {id: '462', label: 'Gangbang'},
            {id: '696', label: 'Ganguro'},
            {id: '2278', label: 'Giantess'},
            {id: '1960', label: 'Girls Only'},
            {id: '465', label: 'Glasses'},
            {id: '720', label: 'God-Human Relationship'},
            {id: '1309', label: 'Goddess'},
            {id: '311', label: 'Group Intercourse'},
            {id: '2185', label: 'Gyaru'},
            {id: '2359', label: 'Hairy Armpit'},
            {id: '534', label: 'Hand Job'},
            {id: '491', label: 'Happy Sex'},
            {id: '1397', label: 'Hardcore'},
            {id: '1487', label: 'Harem-seeking Male Lead'},
            {id: '1744', label: 'Hot Springs'},
            {id: '555', label: 'Housewife-Housewives'},
            {id: '1853', label: 'Human Pet'},
            {id: '1724', label: 'Human Toilets'},
            {id: '459', label: 'Human-Nonhuman Relationship'},
            {id: '552', label: 'Humiliation'},
            {id: '1732', label: 'Hypnotism'},
            {id: '1211', label: 'Idols'},
            {id: '1358', label: 'Impregnation'},
            {id: '2506', label: 'Inari'},
            {id: '753', label: 'Incest as a Subplot'},
            {id: '423', label: 'Infidelity'},
            {id: '2186', label: 'Inflation'},
            {id: '431', label: 'Inverted Nipples'},
            {id: '441', label: 'Jealous Lover'},
            {id: '331', label: 'Jealousy'},
            {id: '408', label: 'Kidnapping'},
            {id: '1283', label: 'Kimono'},
            {id: '2507', label: 'Konkon'},
            {id: '2158', label: 'Korean Comic'},
            {id: '1759', label: 'Kunoichi (Ninja Girls)'},
            {id: '990', label: 'Large Dicks'},
            {id: '2187', label: 'Leotard'},
            {id: '332', label: 'Lingerie'},
            {id: '1580', label: 'Little Sisters'},
            {id: '1771', label: 'Live-in Lover'},
            {id: '1326', label: 'Love At First Sight'},
            {id: '1490', label: 'Love Rivals'},
            {id: '1167', label: 'Love Triangles'},
            {id: '539', label: 'Magic'},
            {id: '565', label: 'Magical Girls'},
            {id: '912', label: 'Maids'},
            {id: '681', label: 'Male Dominance'},
            {id: '659', label: 'Mangaka'},
            {id: '662', label: 'Masochists'},
            {id: '880', label: 'Master-Pet Relationship'},
            {id: '460', label: 'Master-Servant Relationship'},
            {id: '389', label: 'Master-Slave Relationship'},
            {id: '1714', label: 'Mermaids'},
            {id: '354', label: 'MILFs'},
            {id: '303', label: 'Mind Break'},
            {id: '304', label: 'Mind Control'},
            {id: '1114', label: 'Molesters'},
            {id: '1409', label: 'Monster Girls'},
            {id: '1243', label: 'Monster Sex'},
            {id: '1175', label: 'Monsters'},
            {id: '784', label: 'Mother and Daughter'},
            {id: '393', label: 'Mother and Son'},
            {id: '342', label: 'Mother Complex'},
            {id: '1716', label: 'Mother-in-Law'},
            {id: '1826', label: 'Multiple Penetration'},
            {id: '1741', label: 'Neighbors'},
            {id: '370', label: 'Netorare'},
            {id: '2243', label: 'Netori'},
            {id: '451', label: 'Newlyweds'},
            {id: '1717', label: 'Nipple Intercourse'},
            {id: '944', label: 'Nipple Play'},
            {id: '2503', label: 'No Penetration'},
            {id: '461', label: 'Non-Human Pregnancy'},
            {id: '1185', label: 'Nuns'},
            {id: '1046', label: 'Nurses'},
            {id: '605', label: 'Obsessive Love'},
            {id: '1738', label: 'Office Ladies'},
            {id: '2331', label: 'Old Man'},
            {id: '1366', label: 'Older Brother'},
            {id: '1648', label: 'Older Female Young Boy'},
            {id: '355', label: 'Older Female Younger Male'},
            {id: '1229', label: 'Older Male Younger Female'},
            {id: '1241', label: 'Older Sister'},
            {id: '504', label: 'Outdoor Intercourse'},
            {id: '360', label: 'Paizuri'},
            {id: '1275', label: 'Pantyhose'},
            {id: '2303', label: 'Partial Censorship'},
            {id: '665', label: 'Partially Colored'},
            {id: '1736', label: 'Pegging'},
            {id: '576', label: 'Personality Change'},
            {id: '387', label: 'Perverted Boss'},
            {id: '300', label: 'Perverted Characters'},
            {id: '366', label: 'Perverted Teachers'},
            {id: '1526', label: 'Perverts'},
            {id: '1328', label: 'Pets'},
            {id: '1465', label: 'Piercings'},
            {id: '1657', label: 'Plain Girls'},
            {id: '688', label: 'Plastic Surgery'},
            {id: '312', label: 'Polygamy'},
            {id: '1317', label: 'Poor Characters'},
            {id: '2282', label: 'Poor Grammar'},
            {id: '1440', label: 'Porn Industry'},
            {id: '367', label: 'Porn Stars'},
            {id: '530', label: 'Porn with Plot'},
            {id: '1656', label: 'Possessed'},
            {id: '677', label: 'Possession'},
            {id: '1602', label: 'Possessive Lover'},
            {id: '305', label: 'Pregnancy'},
            {id: '1543', label: 'Pretend Rape'},
            {id: '1662', label: 'Priestesses'},
            {id: '1140', label: 'Priests'},
            {id: '1160', label: 'Princes'},
            {id: '1161', label: 'Princesses'},
            {id: '618', label: 'Prisoners'},
            {id: '1608', label: 'Proactive Protagonist'},
            {id: '1528', label: 'Producers'},
            {id: '394', label: 'Prostitution'},
            {id: '507', label: 'Public Intercourse'},
            {id: '406', label: 'Public Nudity'},
            {id: '787', label: 'Punishment Sex'},
            {id: '1418', label: 'Punishment'},
            {id: '1434', label: 'Queens'},
            {id: '470', label: 'Rabbit Girls'},
            {id: '567', label: 'Reverse Harem'},
            {id: '376', label: 'Reverse Rape'},
            {id: '2281', label: 'Rewrite'},
            {id: '726', label: 'Rich Boy'},
            {id: '727', label: 'Rich Family'},
            {id: '368', label: 'Rich Girl'},
            {id: '505', label: 'Rushed Ending/Axed'},
            {id: '663', label: 'Sadist'},
            {id: '499', label: 'Sadomasochism'},
            {id: '432', label: 'Scat'},
            {id: '995', label: 'School Girls'},
            {id: '313', label: 'School Intercourse'},
            {id: '478', label: 'School Nurse-Student Relationship'},
            {id: '1491', label: 'Secret Crush'},
            {id: '399', label: 'Secret Relationship'},
            {id: '1556', label: 'Seduction'},
            {id: '443', label: 'Senpai-Kouhai Relationship'},
            {id: '301', label: 'Sex Addicts'},
            {id: '400', label: 'Sex Friends Become Lovers'},
            {id: '629', label: 'Sex Friends'},
            {id: '450', label: 'Sex Industry'},
            {id: '1273', label: 'Sex Slaves'},
            {id: '837', label: 'Sex Toys'},
            {id: '695', label: 'Sexual Abuse'},
            {id: '476', label: 'Sexual Assault'},
            {id: '1611', label: 'Sexual Frustration'},
            {id: '2325', label: 'Shemale'},
            {id: '652', label: 'Shy Characters'},
            {id: '655', label: 'Sibling Love'},
            {id: '1403', label: 'Sister and Brother'},
            {id: '440', label: 'Sister Complex'},
            {id: '1330', label: 'Sisters'},
            {id: '811', label: 'Sketchy Art Style'},
            {id: '583', label: 'Sleep Intercourse'},
            {id: '1377', label: 'Sluts'},
            {id: '434', label: 'Small Breasts'},
            {id: '909', label: 'Son Complex'},
            {id: '1387', label: 'Spirits'},
            {id: '1346', label: 'Star-Crossed Lover/s'},
            {id: '531', label: 'Step-Daughter'},
            {id: '532', label: 'Step-Father'},
            {id: '533', label: 'Step-Father/Step-Daughter Relationship'},
            {id: '770', label: 'Step-Mother'},
            {id: '334', label: 'Step-Mother/Step-Son Relationship'},
            {id: '371', label: 'Step-Sibling Love'},
            {id: '521', label: 'Step-Siblings'},
            {id: '833', label: 'Step-Son'},
            {id: '1327', label: 'Stockings'},
            {id: '641', label: 'Student Council'},
            {id: '315', label: 'Student-Tutor Relationship'},
            {id: '378', label: 'Succubus'},
            {id: '609', label: 'Sudden Appearance'},
            {id: '425', label: 'Sudden Confession'},
            {id: '1179', label: 'Swimsuit/s'},
            {id: '1479', label: 'Tanned'},
            {id: '1126', label: 'Teacher-Student Relationship'},
            {id: '369', label: 'Teacher-Teacher Relationship'},
            {id: '1388', label: 'Teachers'},
            {id: '1686', label: 'Threesome (MFF)'},
            {id: '1688', label: 'Threesome (MMF)'},
            {id: '335', label: 'Threesome (Other)'},
            {id: '2300', label: 'Time Stop'},
            {id: '650', label: 'Tomboy'},
            {id: '2189', label: 'Torture'},
            {id: '518', label: 'Transgender'},
            {id: '344', label: 'Trap'},
            {id: '553', label: 'Tribadism'},
            {id: '653', label: 'Tsundere'},
            {id: '591', label: 'Tutors'},
            {id: '578', label: 'Twincest'},
            {id: '336', label: 'Twins'},
            {id: '1923', label: 'Uncle and Niece'},
            {id: '414', label: 'Unlucky Character/s'},
            {id: '1284', label: 'Unrequited Love'},
            {id: '2313', label: 'Unusual Pupils'},
            {id: '1157', label: 'Urethral Intercourse'},
            {id: '817', label: 'Urethral Play'},
            {id: '435', label: 'Urination'},
            {id: '1136', label: 'Vampires'},
            {id: '1137', label: 'Virgins'},
            {id: '588', label: 'Virtual Reality'},
            {id: '1841', label: 'Vore'},
            {id: '361', label: 'Voyeurism'},
            {id: '1334', label: 'Waitresses'},
            {id: '877', label: 'Werewolf'},
            {id: '544', label: 'Widow'},
            {id: '613', label: 'Wife Corruption'},
            {id: '545', label: 'Wife Depravity'},
            {id: '1385', label: 'Wife-Wives'},
            {id: '1485', label: 'Witches'},
            {id: '1412', label: 'Wolf Girls'},
            {id: '1071', label: 'X-Ray'},
            {id: '873', label: 'Yandere'},
            {id: '1029', label: 'Youkai'},
            {id: '500', label: 'Young Master'},
            {id: '2342', label: 'Yuri as a Subplot'}
        ]

        return [App.createTagSection({ id: '0', label: 'genres', tags: arrayTags.map(x => App.createTag(x)) })]
    }
}