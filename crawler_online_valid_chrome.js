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
process.setMaxListeners(0);


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
    instance.useCount += 2
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
    const page = await browser.newPage();
    await page.setUserAgent(rusticUA);
    try{
      const status = await page.goto(elem['url'], {"waitUntil" : "networkidle2"});
      if (!status.ok) {
        throw new Error('cannot open URL');
      }
    }
    catch (err) {
      console.log(err + " on Page: " + elem['url']);    
      throw new Error('cannot open URL');
    }
    page.close();
    i++;
    console.log("success pagenum : " + i);
    console.log("pool infos   resource:" + chromePool.spareResourceCapacity + " size : " + chromePool.size + " available : " + chromePool.available + " borrowed : " + chromePool.borrowed + " pending : "+ chromePool.pending);
  }, (err) => {console.log("chromePool : " + err)})
}


chromePool.drain().then(() => chromePool.clear())

