const assert = require('assert').strict

const scheduledUrls = []
const darkSkinSearchResponse = `
    <html>
        <body>
            <article data-card="true" data-book="13088">
                <a href="/original/13088-popuni-kei-joshi-panic">
                    <img src="https://hentaicdn.com/hentai/cover/_S13088.jpg" alt="Popuni Kei Joshi Panic!">
                </a>
                <h3>Popuni Kei Joshi Panic!</h3>
            </article>
        </body>
    </html>
`

global.App = {
    createRequest: request => request,
    createRequestManager: () => ({
        schedule: async request => {
            scheduledUrls.push(request.url)
            return {
                status: 200,
                data: request.url.includes('/content/422-dark-skin') ? darkSkinSearchResponse : '<html></html>'
            }
        }
    }),
    createPagedResults: results => results,
    createPartialSourceManga: manga => manga,
    createChapter: chapter => chapter,
    createTag: tag => tag,
    createTagSection: section => section
}

const {Hentai2Read} = require('../src/Hentai2Read/Hentai2Read')

describe('Hentai2Read content-tag search', () => {
    beforeEach(() => scheduledUrls.splice(0))

    it('exposes the website tag ID for Dark Skin', async () => {
        const source = new Hentai2Read()
        const sections = await source.getSearchTags()
        const tags = sections.flatMap(section => section.tags)
        const darkSkin = tags.find(tag => tag.label === 'Dark Skin')

        assert.equal(tags.length, 380)
        assert.deepEqual(darkSkin, {id: '422', label: 'Dark Skin'})
    })

    it('returns manga results when filtering by Dark Skin', async () => {
        const source = new Hentai2Read()

        const page = await source.getSearchResults({
            title: '',
            includedTags: [{id: '422', label: 'Dark Skin'}],
            excludedTags: []
        }, {})

        assert.deepEqual(scheduledUrls, [
            'https://hentai2read.com/content/422-dark-skin'
        ])
        assert.equal(page.results.length, 1)
        assert.deepEqual(page.results[0], {
            mangaId: 'original/13088-popuni-kei-joshi-panic',
            image: 'https://hentaicdn.com/hentai/cover/_S13088.jpg',
            title: 'Popuni Kei Joshi Panic!'
        })
    })

    it('uses the content tag pagination route', async () => {
        const source = new Hentai2Read()

        await source.getSearchResults({
            title: '',
            includedTags: [{id: '113', label: 'Glasses'}],
            excludedTags: []
        }, {nextPage: 2})

        assert.deepEqual(scheduledUrls, [
            'https://hentai2read.com/content/113-glasses/page-2'
        ])
    })

    it('keeps title searches on the search route', async () => {
        const source = new Hentai2Read()

        await source.getSearchResults({
            title: 'Popuni Kei Joshi Panic!',
            includedTags: [],
            excludedTags: []
        }, {})

        assert.deepEqual(scheduledUrls, [
            'https://hentai2read.com/search?q=Popuni%20Kei%20Joshi%20Panic!&sort=latest'
        ])
    })

    it('keeps advanced multi-tag searches on the search route', async () => {
        const source = new Hentai2Read()

        await source.getSearchResults({
            title: '',
            includedTags: [
                {id: '113', label: 'Glasses'},
                {id: '422', label: 'Dark Skin'}
            ],
            excludedTags: []
        }, {})

        assert.deepEqual(scheduledUrls, [
            'https://hentai2read.com/search?with=113,422&sort=latest'
        ])
    })
})

describe('Hentai2Read chapter order', () => {
    it('reverses the website chapter list and recalculates sorting indexes', () => {
        const source = new Hentai2Read()
        const response = `
            <script>{"component":"Book/Show","props":{"chapters":[
                {"id":103,"number":"3","title":"Chapter 3","date":"2026-03-03"},
                {"id":102,"number":"2","title":"Chapter 2","date":"2026-02-02"},
                {"id":101,"number":"1","title":"Chapter 1","date":"2026-01-01"}
            ]}}</script>
        `

        const chapters = source.parser.parseChapters(response, 'original/example')

        assert.deepEqual(chapters.map(chapter => chapter.id), ['101', '102', '103'])
        assert.deepEqual(chapters.map(chapter => chapter.sortingIndex), [0, 1, 2])
        assert.deepEqual(chapters.map(chapter => chapter.chapNum), [1, 2, 3])
    })
})
