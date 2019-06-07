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

function compareRankings(idealRanking, actualRanking) {
    let augmentedRanking = {};

    Object.keys(idealRanking).forEach(query => {
        const idealResults = idealRanking[query];
        const actualResults = actualRanking[query];
        const idealLength = idealRanking[query].length;
        let dcg = 0,
            iDcg = 0;
        idealResults.forEach((idealResult, idx) => {
            const rel = idealLength - idx;
            const i = actualResults.indexOf(idealResult) + 1;
            dcg += rel / Math.log2(i + 1);
            iDcg += rel / Math.log2(idx + 2);
        });
        augmentedRanking[query] = dcg / (iDcg === 0 ? 1 : iDcg);
    });

    console.log(augmentedRanking);
}

async function main() {
    await solr.setup();

    // let wikiDocuments = await wiki.readDump("simplewiki.json");
    // await solr.deleteAllDocuments();
    // await solr.import(wikiDocuments);

    await solr.uploadFeatures();
    await solr.uploadModel();

    let queries = await readQueries("top-queries.txt");
    queries = queries.slice(0, 2);
    let idealRanking = await wiki.fetchRankings(queries);
    let actualRanking = await solr.fetchRankings(queries);

    compareRankings(idealRanking, actualRanking);
}

main().then(() => console.log("All done"));