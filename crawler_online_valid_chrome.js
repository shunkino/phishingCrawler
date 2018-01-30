const puppeteer = require('puppeteer');
const argv = require('minimist')(process.argv.slice(2));
const file = require('fs');
const { JSDOM } = require('jsdom');


var phishingData = require('./online-valid.json');


(async () => {
  const browser = await puppeteer.launch();
  const rusticUA = "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; Touch; .NET4.0C; .NET4.0E; .NET CLR 2.0.50727; .NET CLR 3.0.30729; .NET CLR 3.5.30729; rv:11.0) like Gecko"
  const page = await browser.newPage();
  await page.setUserAgent(rusticUA);
  for (let elem of phishingData) {
    try{
      await page.goto(elem['url'], {"waitUntil" : "networkidle2"});
    }
    catch (err) {
      console.log("Error!" + err);
    }
  }

  await browser.close();
})();

