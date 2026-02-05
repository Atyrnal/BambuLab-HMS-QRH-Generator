const fs = require('fs')
const path = require('path')

const ogData = JSON.parse(fs.readFileSync("p_series_hms_codes.json"))
const newData = {}
Object.keys(ogData).forEach((hms) => {
    const link = ogData[hms]
    if (newData[link] == undefined) newData[link] = []
    if (link.endsWith(hms.replace('-', '_'))) {
        newData[link].splice(0, 0, hms)
    } else {
        newData[link].push(hms)
    }
})

fs.writeFileSync("P1S-HMS-Wiki.json", JSON.stringify(newData, null, 2))