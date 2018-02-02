const puppeteer = require('puppeteer');
const genericPool = require("generic-pool");
const argv = require('minimist')(process.argv.slice(2));
const file = require('fs');
const { JSDOM } = require('jsdom');

const rusticUA = "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; Touch; .NET4.0C; .NET4.0E; .NET CLR 2.0.50727; .NET CLR 3.0.30729; .NET CLR 3.5.30729; rv:11.0) like Gecko"
var phishingData = require('./online-valid.json');

process.on('unhandledRejection', (reason) => {
    console.log('Reason: ' + reason);
});


const initialize = ({
  max = 20,
  min = 2,
  idleTimeoutMillis = 30000,
  maxUses = 50,
  testOnBorrow = true,
  validator = () => Promise.resolve(true),
} = {}) => {
  const factory = {
    create: () => puppeteer.launch().then(instance => {
      instance.useCount = 0
      return instance
    }),
    destroy: (instance) => {
      instance.close()
    },
    validate: (instance) => {
      return validator(instance)
        .then(valid => Promise.resolve(valid && (maxUses <= 0 || instance.useCount < maxUses)))
    },
  }
  const config = {
    max,
    min,
    idleTimeoutMillis,
    testOnBorrow,
  }
  const pool = genericPool.createPool(factory, config)
  const genericAcquire = pool.acquire.bind(pool)
  pool.acquire = () => genericAcquire().then(instance => {
    instance.useCount += 1
    return instance
  })
  pool.use = (fn) => {
    let resource
    return pool.acquire()
      .then(r => {
        resource = r
        return resource
      })
      .then(fn)
      .then((result) => {
        pool.release(resource)
        return result
      }, (err) => {
        pool.release(resource)
        throw err
      })
  }

  return pool
}

const chromePool = initialize({});

var i = 1;

for (let elem of phishingData) {
  chromePool.use(async (browser) => {
    const page = await browser.newPage()
    try{
      const status = await page.goto(elem['url']);
      if (!status.ok) {
        throw new Error('cannot open URL');
      }
    }
    catch (err) {
      console.log(err + " on Page: " + elem['url']);    
    }
    const content = await page.content();
    page.close();
    i++;
    console.log("success pagenum : " + i);
  }, (err) => {console.log("chromePool : Error!")})
}


chromePool.drain().then(() => chromePool.clear())



// (async () => {
//   const browser = await puppeteer.launch();
//   const rusticUA = "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; Touch; .NET4.0C; .NET4.0E; .NET CLR 2.0.50727; .NET CLR 3.0.30729; .NET CLR 3.5.30729; rv:11.0) like Gecko"
//   const page = await browser.newPage();
//   await page.setUserAgent(rusticUA);
//   for (let elem of phishingData) {
//     try{
//       await page.goto(elem['url'], {"waitUntil" : "networkidle2"});
//     }
//     catch (err) {
//       console.log(err + " on Page: " + elem['url']);
//     }
//   }
// 
//   await browser.close();
// })();
// 
