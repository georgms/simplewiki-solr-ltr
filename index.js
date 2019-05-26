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
        augmentedRanking[query] = {};

        let idealResults = idealRanking[query];
        let actualResults = actualRanking[query];
        idealResults.forEach(idealResult => {
            augmentedRanking[query][idealResult] = actualResults.indexOf(idealResult);
        })
    });

    console.log(augmentedRanking);
}

async function main() {
    await solr.setup();

    let wikiDocuments = await wiki.readDump("simplewiki.json");
    await solr.import(wikiDocuments);

    let queries = await readQueries("top-queries.txt");
    let idealRanking = await wiki.fetchRankings(queries);
    let actualRanking = await solr.fetchRankings(queries);

    compareRankings(idealRanking, actualRanking);
}

main().then(() => console.log("All done"));