const puppeteer = require('puppeteer');
const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient; 
const genericPool = require("generic-pool");
const argv = require('minimist')(process.argv.slice(2));
const file = require('fs');
const { JSDOM } = require('jsdom');
const rusticUA = "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; Touch; .NET4.0C; .NET4.0E; .NET CLR 2.0.50727; .NET CLR 3.0.30729; .NET CLR 3.5.30729; rv:11.0) like Gecko"

// database
var db;

// csv
var csv = require('csv');
const parser = csv.parse({columns: ['id', 'url']});
const fileStream = file.createReadStream('top-1m.csv', {encoding : 'utf-8'}); 
// const fileStream = file.createReadStream('test1m.csv', {encoding : 'utf-8'}); 
var legitimateData = [];  
fileStream.pipe(parser);
parser.on('readable', () => {
  var data;
  while (data = parser.read()) {
    // console.log(data['url']);
    legitimateData.push(data);
  }
});

parser.on('end', () => {
  // console.log('end');
  MongoClient.connect("mongodb://localhost:27017/legitimate", function(err, client) {
    if(err) throw err;
    db = client.db('legitimate');
    crawlFunction(chromePool, legitimateData);
    db.close;
  });
});

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


var crawlFunction = function (chromePool, legitimateData) {
  var i = 1;
  for (let elem of legitimateData) {
    chromePool.use(async (browser) => {
      const page = await browser.newPage();
      // page.on('response', response => {
      //   const status = response.status()
      //   if ((status >= 300) && (status <= 399)) {
      //     redirectChain.push(response.headers()['location']);
      //   }
      // })
      await page.setUserAgent(rusticUA);
      try{
        let targetURL = 'http://' + elem['url'];
        let HTTPHeader;
        let HTTPHeaderLength;
        let redirectNum;
        let redirectChainArray;
        
        const response = await page.goto(targetURL, {"waitUntil" : "networkidle2"});
        if (!response.ok) {
          throw new Error('cannot open URL');
        }
        // headersは，Jsonの連想配列に入っているからlengthは直接取れない
        // console.log( "this is a debug message !!" + JSON.stringify(response.headers()).length );
        HTTPHeader = response.headers();
        HTTPHeaderLength = JSON.stringify(response.headers()).length;
	const redChain  = response.request().redirectChain();
        redirectChainArray = redChain.map( elem => {return elem.response().headers()['location']} );
        redirectNum = redirectChainArray.length;
        insObj = {"url" : targetURL, "header" : HTTPHeader, "headerlength" : HTTPHeaderLength, "redirectChain" : redirectChainArray, "redirectNum" : redirectNum};
        // console.log(insObj);
        db.collection("httpLog").insertOne(insObj, function (err, res) {
          if (err) throw err;
        });
      }
      catch (err) {
        console.log(err + " on Page: " + elem['url']);    
        // throw new Error('cannot open URL');
      }
      page.close();
      i++;
      // console.log("success pagenum : " + i);
      // console.log("pool infos resource:" + chromePool.spareResourceCapacity + " size : " + chromePool.size + " available : " + chromePool.available + " borrowed : " + chromePool.borrowed + " pending : "+ chromePool.pending);
    }, (err) => {console.log("chromePool : " + err)})
  }
  chromePool.drain().then(() => chromePool.clear())
}
