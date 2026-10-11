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
    version: '1.8',
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
                url = page === 1 ? `${DOMAIN}/browse` : `${DOMAIN}/browse/page-${page}`
                break
            case 'popular':
                url = page === 1 ? `${DOMAIN}/browse/most-viewed` : `${DOMAIN}/browse/most-viewed/page-${page}`
                break
            case 'trending':
                url = `${DOMAIN}/hentai-list/all/any/all/trending/${page}`
                break
            case 'top-rated':
                url = page === 1 ? `${DOMAIN}/browse/top-rated` : `${DOMAIN}/browse/top-rated/page-${page}`
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
            url: `${DOMAIN}/reader/${mangaId.replace(/^(original|doujinshi|imageset)\//, '')}/${chapterId}/page-1`,
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
        const includedTagIds = (query.includedTags || []).map(tag => tag.id)
        const excludedTagIds = (query.excludedTags || []).map(tag => tag.id)

        const parameters: string[] = []
        if (query.title) parameters.push(`q=${encodeURIComponent(query.title)}`)
        if (includedTagIds.length) parameters.push(`with=${includedTagIds.map(encodeURIComponent).join(',')}`)
        if (excludedTagIds.length) parameters.push(`without=${excludedTagIds.map(encodeURIComponent).join(',')}`)
        if (query.includeOperator?.toLowerCase() === 'or') parameters.push('match=any')
        parameters.push('sort=latest')
        if (page > 1) parameters.push(`page=${page}`)
        const url = `${DOMAIN}/search?${parameters.join('&')}`

        const request = App.createRequest({
            url: url,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)

        return Promise.resolve(this.parser.parsePagedResult(response.data, page));
    }

    getSearchTags(): Promise<TagSection[]> {
        return Promise.resolve(this.parser.getTags())
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
