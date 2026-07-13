import {
    BadgeColor, Chapter, ChapterDetails,
    ChapterProviding,
    ContentRating, HomeSection,
    MangaProviding, PagedResults,
    Searchable, SearchRequest,
    SourceInfo,
    SourceIntents, SourceManga, TagSection,
    SearchField
} from "@paperback/types";
import {Hentai2ReadParser} from "./Hentai2ReadParser";


const DOMAIN = 'https://hentai2read.com'

export const Hentai2ReadInfo: SourceInfo = {
    author: 'rzmeu',
    contentRating: ContentRating.ADULT,
    description: `Extension that pulls items from ${DOMAIN}`,
    icon: 'icon.png',
    language: 'ENG',
    name: 'Hentai2Read',
    sourceTags: [
        {
            text: '18+',
            type: BadgeColor.YELLOW
        }
    ],
    version: '1.0',
    websiteBaseURL: 'https://github.com/rzmeu/extensions-generic',
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.SETTINGS_UI | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
}

export class Hentai2Read implements Searchable, MangaProviding, ChapterProviding {
    cloudflare_domain: boolean = true

    readonly requestManager = App.createRequestManager({
        requestsPerSecond: 5,
        requestTimeout: 15000
    });

    constructor() {}

    parser = new Hentai2ReadParser(DOMAIN)

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const section1 = App.createHomeSection({id: 'latest', title: 'Latest', type: 'singleRowNormal', containsMoreItems: true})
        const section2 = App.createHomeSection({id: 'popular', title: 'Popular', type: 'singleRowNormal', containsMoreItems: true})
        //const section3 = App.createHomeSection({id: 'trending', title: 'Trending', type: 'singleRowNormal', containsMoreItems: true})
        const section4 = App.createHomeSection({id: 'top-rated', title: 'Top Rated', type: 'singleRowNormal', containsMoreItems: true})
        const sections = [section1, section2, section4]

        const promises: Promise<void>[] = []
        for(const section of sections) {
            sectionCallback(section)

            promises.push(
                this.getViewMoreItems(section.id, {nextPage: 1}).then(sectionPagedResult => {
                    section.items = sectionPagedResult?.results
                    sectionCallback(section)
                })
            )
        }

        // Make sure the function completes
        await Promise.all(promises)
    }

    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.nextPage || 1
        let url = ''

        switch (homepageSectionId) {
            case 'latest':
                url = `${DOMAIN}/hentai-list/all/any/all/last-added/${page}`
                break
            case 'popular':
                url = `${DOMAIN}/hentai-list/all/any/all/most-popular/${page}`
                break
            case 'trending':
                url = `${DOMAIN}/hentai-list/all/any/all/trending/${page}`
                break
            case 'top-rated':
                url = `${DOMAIN}/hentai-list/all/any/all/top-rating/${page}`
                break
        }

        const request = App.createRequest({
            url: url,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 2)
        this.CloudFlareError(response.status)

        return this.parser.parsePagedResult(response.data, page)
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = App.createRequest({
            url: `${DOMAIN}/${mangaId}/${chapterId}`,
            method: 'GET',
        })

        const response = await this.requestManager.schedule(request, 3)
        this.CloudFlareError(response.status)
        return this.parser.parseChapterDetails(response.data, mangaId, chapterId)
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = App.createRequest({
            url: `${DOMAIN}/${mangaId}`,
            method: 'GET',
        });

        const response = await this.requestManager.schedule(request, 3)
        this.CloudFlareError(response.status)
        return Promise.resolve(this.parser.parseChapters(response.data, mangaId));
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const request = App.createRequest({
            url: `${DOMAIN}/${mangaId}`,
            method: 'GET',
        })

        const response = await this.requestManager.schedule(request, 1)
        this.CloudFlareError(response.status)
        return Promise.resolve(this.parser.parseMangaDetails(response.data, mangaId, this));
    }

    getSearchFields(): Promise<SearchField[]> {
        return Promise.resolve([]);
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = metadata?.nextPage || 1

        let jsonQ = ''

        if(query.title) {
            jsonQ = `a:10:{s:7:"nme_opr";s:1:"0";s:3:"nme";s:${query.title.length}:"${query.title}";s:7:"ats_opr";s:1:"1";s:3:"ats";s:0:"";s:7:"chr_opr";s:1:"1";s:3:"chr";s:0:"";s:3:"tag";a:3:{s:3:"inc";N;s:3:"exc";N;s:3:"mde";s:2:"or";}s:11:"rls_yer_opr";s:1:"0";s:7:"rls_yer";s:0:"";s:3:"sts";s:1:"0";}`
        } else if(query.includedTags) {
            let tagQuery = `a:${query.includedTags.length}:{`

            for(let i = 0; i < query.includedTags.length; i++) {
                const tagId = query.includedTags[i]!.id + ''
                tagQuery += `i:${i};s:${tagId.length}:"${tagId}";`
            }
            tagQuery += '}'

            jsonQ = `a:10:{s:7:"nme_opr";s:1:"1";s:3:"nme";s:0:"";s:7:"ats_opr";s:1:"1";s:3:"ats";s:0:"";s:7:"chr_opr";s:1:"1";s:3:"chr";s:0:"";s:3:"tag";a:3:{s:3:"inc";${tagQuery}s:3:"exc";N;s:3:"mde";s:3:"and";}s:11:"rls_yer_opr";s:1:"0";s:7:"rls_yer";s:0:"";s:3:"sts";s:1:"0";}`
        }

        const base64 = Base64.encode(jsonQ);

        const url = `${DOMAIN}/hentai-list/advanced-search/${base64}/all/last-added/${page}`

        const request = App.createRequest({
            url: url,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)

        return Promise.resolve(this.parser.parsePagedResult(response.data, page));
    }

    async getSearchTags(): Promise<TagSection[]> {
        return Promise.resolve(this.parser.getTags());
    }

    supportsSearchOperators(): Promise<boolean> {
        return Promise.resolve(true);
    }

    CloudFlareError(status: any) {
        if (status == 503) {
            throw new Error(`CLOUDFLARE BYPASS ERROR:\nPlease go to Settings > Sources > ${DOMAIN} and press Cloudflare Bypass`)
        }
    }

    async getCloudflareBypassRequestAsync(): Promise<Request> {
        // @ts-ignore
        return App.createRequest({
            url: DOMAIN,
            method: 'GET',
            headers: {
                'referer': `${DOMAIN}/`,
                'user-agent': await this.requestManager.getDefaultUserAgent()
            }
        })
    }

}

// @ts-ignore
// @ts-ignore
let Base64 = {
    _keyStr: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
        "abcdefghijklmnopqrstuvwxyz0123456789+/=",
    encode: function (e) {
        let t = "";
        let n, r, i, s, o, u, a;
        let f = 0;
        e = Base64._utf8_encode(e);
        while (f < e.length) {
            n = e.charCodeAt(f++);
            r = e.charCodeAt(f++);
            i = e.charCodeAt(f++);
            s = n >> 2;
            o = (n & 3) << 4 | r >> 4;
            u = (r & 15) << 2 | i >> 6;
            a = i & 63;
            if (isNaN(r)) {
                u = a = 64
            } else if (isNaN(i)) {
                a = 64
            }
            t = t +
                this._keyStr.charAt(s) +
                this._keyStr.charAt(o) +
                this._keyStr.charAt(u) +
                this._keyStr.charAt(a)
        }
        return t
    },
    _utf8_encode: function (e) {
        e = e.replace(/\r\n/g, "\n");
        let t = "";
        for (let n = 0; n < e.length; n++) {
            let r = e.charCodeAt(n);
            if (r < 128) {
                t += String.fromCharCode(r)
            } else if (r > 127 && r < 2048) {
                t +=
                    String.fromCharCode(r >> 6 | 192);
                t +=
                    String.fromCharCode(r & 63 | 128)
            } else {
                t +=
                    String.fromCharCode(r >> 12 | 224);
                t +=
                    String.fromCharCode(r >> 6 & 63 | 128);
                t +=
                    String.fromCharCode(r & 63 | 128)
            }
        }
        return t
    },



}