const fs = require("fs");
const readline = require("readline");
const wiki = require("./wiki.js");
const solr = require("./solr.js");

async function readQueries(filename) {
    let queries = [];

    const fileStream = fs.createReadStream(filename);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await
        (const line of rl) {
        queries.push(line);
    }

    return queries;
}

async function calculateNdcgs(queries) {
    queries.forEach(async query => {
        console.log(query);
        let wikiRanking = await wiki.fetchRanking(query);
        wikiRanking = wikiRanking.slice(0, 20);
        let solrRanking = await solr.fetchRanking(query);
        solrRanking = solrRanking.slice(0, 20);

        let dcg = 0;
        let idcg = 0;
        solrRanking.forEach((document, index) => {
            const i = index + 1;
            const rel = wikiRanking.length - Math.max(0, wikiRanking.indexOf(wikiRanking));
            const idealRank = wikiRanking.length - index;
            console.log(wikiRanking.length, index);
            console.log(rel, idealRank);
            dcg += (Math.pow(2, rel) - 1) / (Math.log2(i + 1));
            idcg += (Math.pow(2, idealRank) - 1) / (Math.log2(i + 1));
            console.log(dcg, idcg, dcg / idcg);
        });
    });
}

async function main() {
    // await solr.setup();
    //
    // let wikiDocuments = await wiki.readDump("simplewiki.json");
    // await solr.deleteAllDocuments();
    // await solr.import(wikiDocuments);
    //
    // await solr.uploadFeatures();
    //
    // await solr.uploadModel();
    //
    let queries = await readQueries("top-queries.txt");
    calculateNdcgs(queries);
}

main().then(() => console.log("All done"));