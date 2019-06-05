const axios = require("axios");
const fs = require("fs");

const SOLR_BASE_URL = "http://10.199.0.1:8983/solr/simplewiki";

module.exports = {
    async deleteAllDocuments() {
        try {
            await axios.post(SOLR_BASE_URL + "/update?commit=true", {"delete": {"query": "*:*"}});
            console.log("Successfully deleted all documents");
        } catch (error) {
            console.error(`Could not delete all documents: ${error}`);
        }
    },

    wikiToSolrDocument(wikiDocument) {
        return {
            id: wikiDocument.title,
            title_txt_en_split: wikiDocument["title"],
            opening_txt_en_split: wikiDocument["opening_text"],
            text_txt_en_split: wikiDocument["text"],
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

        console.log("Importing " + solrDocuments.length + " documents");

        let chunkSize = 10000;

        for (let start = 0; start < solrDocuments.length; start += chunkSize) {
            console.log(`Import documents ${start} to ${start + chunkSize}`);
            let chunk = solrDocuments.slice(start, start + chunkSize);
            try {
                await axios.post(baseUrl, chunk, {
                    headers: {
                        "Content-type": "application/json; charset=utf-8"
                    },
                    maxContentLength: 2147483648
                })
            } catch (error) {
                console.error(error);
            }
        }
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
            fl: "title_txt_en_split,[features]",
            rows: 1000000,
            boost: "popularity_score_f"
        };

        return axios.get(SOLR_BASE_URL + "/browse", {params: solrParams})
            .then(response => response.data["response"]["docs"].map(doc => doc["title_txt_en_split"]))
            .catch(error => console.error(`Could not fetch Wiki results for $query: ` + error));
    },

    async addDynamicField(fieldConfig) {
        let fieldName = fieldConfig["name"];
        let addDynamicField = {
            "add-dynamic-field": fieldConfig
        };

        try {
            /* Check if the field already exists */
            await axios.get(SOLR_BASE_URL + `/schema/dynamicfields/${fieldName}`);
            console.log(`Dynamic field "${fieldName}" already exists`);
        } catch (error) {
            if (error.response.status === 404) {
                /* Field does not exist */
                try {
                    await axios.post(SOLR_BASE_URL + "/schema", addDynamicField);
                    console.log(`Successfully created field "${fieldName}"`);
                } catch (error) {
                    console.error(`Could not create field "${fieldName}": ${error}`);
                }
            } else {
                console.error(`Could not check field "${fieldName}": ${error}`);
            }
        }
        return fieldName;
    },

    async addComponent(componentType, componentConfig) {
        let addFieldValueCache = {};
        addFieldValueCache[`add-${componentType}`] = componentConfig;
        let componentName = componentConfig["name"];

        try {
            /* Check if the field already exists */
            let response = await axios.get(SOLR_BASE_URL + `/config/${componentType}?componentName=${componentName}`);
            if (response.data.config[componentType] && componentName in response.data.config[componentType]) {
                console.log(`${componentType} "${componentName}" already exists`);
            } else {
                try {
                    await axios.post(SOLR_BASE_URL + `/config/${componentType}`, addFieldValueCache);
                    console.log(`Successfully created ${componentType} "${componentName}"`);
                } catch (error) {
                    console.error(`Could not create "${componentType}": ${error}`);
                }
            }
        } catch (error) {
            console.error(`Could not check "${componentType}": ${error}`);
        }
    },

    async setup() {
        let txtsEnSplittingField = {
            "name": "*_txts_en_splitting",
            "type": "text_en_splitting",
            "multiValued": "true",
            "stored": "true",
            "indexed": "true"
        };
        await this.addDynamicField(txtsEnSplittingField);

        let fieldValueCacheName = "QUERY_DOC_FV";
        let fieldValueCache = {
            "name": fieldValueCacheName,
            "class": "solr.search.LRUCache",
            "size": 4096,
            "initialSize": 2048,
            "autowarmCount": 4096,
            "regenerator": "solr.search.NoOpRegenerator"
        };
        await this.addComponent("cache", fieldValueCache);

        let ltrQueryParser = {
            "name": "ltr",
            "class": "org.apache.solr.ltr.search.LTRQParserPlugin"
        };
        await this.addComponent("queryParser", ltrQueryParser);

        let featureTransformer = {
            "name": "features",
            "class": "org.apache.solr.ltr.response.transform.LTRFeatureLoggerTransformerFactory",
            "fvCacheName": fieldValueCacheName
        };
        await this.addComponent("transformer", featureTransformer);
    },

    async uploadFeatures() {
        let features = fs.readFileSync("features.json");

        let featuresExist = false;
        try {
            await axios.get(SOLR_BASE_URL + "/schema/feature-store/_DEFAULT_");
            featuresExist = true;
        } catch (error) {
            console.error(`Could not fetch features: ${error}`);
        }

        if (featuresExist) {
            try {
                await axios.delete(SOLR_BASE_URL + "/schema/feature-store/_DEFAULT_");
            } catch (error) {
                console.error(`Could not delete features: ${error}`);
            }
        }

        try {
            await axios.put(SOLR_BASE_URL + "/schema/feature-store", features, {headers: {"Content-Type": "application/json"}});
            console.log("Successfully uploaded features");
        } catch (error) {
            console.error(`Could not upload features: ${error}`);
        }
    },

    async uploadModel() {
        let model = fs.readFileSync("model.json");

        let modelExists = false;
        try {
            await axios.get(SOLR_BASE_URL + "/schema/model-store/_DEFAULT_");
            modelExists = true;
        } catch (error) {
            console.error(`Could not fetch model: ${error}`);
        }


        if (modelExists) {
            try {
                await axios.delete(SOLR_BASE_URL + "/schema/model-store/_DEFAULT_");
            } catch (error) {
                console.error(`Could not delete model: ${error}`);
            }
        }

        try {
            await axios.put(SOLR_BASE_URL + "/schema/model-store", model, {headers: {"Content-Type": "application/json"}});
            console.log("Successfully uploaded model");
        } catch (error) {
            console.error(`Could not upload model: ${error}`, error.response.data);
        }
    }

};

