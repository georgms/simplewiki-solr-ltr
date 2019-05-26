const axios = require("axios");

const SOLR_BASE_URL = "http://172.17.0.1:8983/solr/simplewiki";

module.exports = {
    async clear() {
        const deleteQuery = "<delete><query>*:*</query></delete>";
        return axios.post(SOLR_BASE_URL + "/update?commit=true", deleteQuery)
            .then(() => console.log("Successfully deleted"))
            .catch(error => console.error(error.response.data.error["msg"]));
    },

    wikiToSolrDocument(wikiDocument) {
        return {
            id: wikiDocument.title,
            title_txt_en_split: wikiDocument["title"],
            opening_txt_en_split: wikiDocument["opening_text"],
            text_txt_en_split_split: wikiDocument["text"],
            popularity_score_f: wikiDocument["popularity_score"],
            category_txts_en_split: wikiDocument["category"],
            incoming_links_i: wikiDocument["incoming_links"],
            auxiliary_text_txts_en_split: wikiDocument["auxiliary_text"],
            update_dt: wikiDocument["timestamp"],
            redirect_txts_en_split: wikiDocument["redirect"].map(redirect => redirect["title"]),
            heading_txts_en_split: wikiDocument["heading"],
            create_dt: wikiDocument["create_timestamp"]
        }
    },

    async import(wikiDocuments) {
        let baseUrl = SOLR_BASE_URL + "/update/json/docs?commit=true&overwrite=true";

        let solrDocuments = wikiDocuments.map(module.exports.wikiToSolrDocument);

        console.log('Importing ' + solrDocuments.length + ' documents');

        axios.post(baseUrl, solrDocuments, {
            headers: {
                "Content-type": "application/json; charset=utf-8"
            },
            maxContentLength: 2147483648
        })
            .then(() => "Successfully imported")
            .catch(error => {
                console.error(error.response.data.error["msg"]);
            });
    },

    async fetchRankings(queries) {
        let ranking = {};

        let promises = queries.map(query => module.exports.fetchRanking(query).then(results => ranking[query] = results));
        await Promise.all(promises);

        return ranking;
    },

    async fetchRanking(query) {
        let solrParams = {
            q: query,
            qf: "title_txt_en_split opening_txt_en_split text_txt_en_split category_txts_en auxiliary_text_txts_en redirect_txts_en heading_txts_en",
            wt: "json",
            fl: "title_txt_en_split",
            rows: 1000000,
            boost: "popularity_score_f"
        };

        return axios.get(SOLR_BASE_URL + "/browse", {params: solrParams})
            .then(response => response.data["response"]["docs"].map(doc => doc["title_txt_en_split"]))
            .catch(error => console.error(`Could not fetch Wiki results for $query: ` + error));
    },

    async setup() {
        let addDynamicField = {
            "add-dynamic-field": {
                "name": "*_txts_en_split",
                "type": "text_en_splitting",
                "multiValued": "true",
                "stored": "true",
                "indexed": "true"
            }
        };

        axios.get(SOLR_BASE_URL + "/schema/dynamicfields/*_txts_en_split").catch(error => {
            if (error.statusCode === 404) {
                return axios.post(SOLR_BASE_URL + "/schema", addDynamicField)
                    .then(() => console.log("Setup Solr successfully"))
                    .catch(error => console.error(error));
            }
        });
    }

};
