const readline = require("readline");
const fs = require("fs");
const axios = require("axios");

module.exports = {
    async fetchRankings(queries) {
        let ranking = {};

        let promises = queries.map(query => module.exports.fetchRanking(query).then(titles => ranking[query] = titles));
        await Promise.all(promises);

        return ranking;
    },

    fetchRanking: async function (query) {
        let baseUrl = "https://simple.wikipedia.org/w/api.php";
        let params = {
            action: "query",
            list: "search",
            format: "json",
            srsearch: query
        };

        try {
            let response = await axios.get(baseUrl, {
                method: "GET",
                params: params,
                responseType: "json"
            });
            return response.data.query.search.map(result => result["title"]);
        } catch (error) {
            console.error(`Could not fetch Wiki results for ${query}: ${error}`);
        }
    },

    async readDump(filename) {
        let documents = [];

        const fileStream = fs.createReadStream(filename);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            let document = JSON.parse(line);
            if (!document["index"]) {
                documents.push(document);
            }
        }

        return documents;
    },
};
