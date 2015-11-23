var express = require('express');
var cors    = require('cors');
var request = require('request');
var storage = require('node-persist');
var raven   = require('raven');
var _       = require('lodash');
var Q       = require('q');

console.log('App started');

// Modules
var twitterAPI = require('./modules/twitter');
var app = express();
app.use(cors({origin: '*'}));

storage.init({
  dir:__dirname+'/store',
});

app.get('/twitter/trend', function(req, res) {
  console.log('app route -> /twitter/trend');
  var placeID = res.get('id') || 1;

  twitterAPI.getTokenApp()
  .then(function(oauthRes){
    return twitterAPI.getTrendingTopics(oauthRes, placeID);
  })
  .then(function(body){
    res.json(body);
  })
});

app.get('/twitter/search/tweets', function(req, res) {
  console.log('app route -> /twitter/search/tweets');
  var placeID = res.get('id') || 1;
  var oauthRes = undefined;

  twitterAPI.getTokenApp().then(function(auth){

    twitterAPI.getTrendingTopics(auth, placeID)
    .then(function(trendingTopics) {
      var trends = trendingTopics[0].trends;
      var placeID = res.get('id') || 1;
      var query = '';

      // Loop trends building query
      _.each(trends, function(k, i){
        query += k.query;
        if(trends.length -1 != i) query += ' OR ';
      });

      twitterAPI.queryTweets(auth, placeID, query)
      .then(function(body){
        console.log('bodyuuu', body)
        res.send(body);
      });
    });
  });
});





/**
 * Method used to control error handling
 */
function onError(err, req, res, next) {
  res.statusCode = 500;
  res.end(res.sentry+'\n');
}

// Ravenjs configure
app.use(raven.middleware.express.requestHandler('https://43d873a54a3a4fdbbcc4f23a9c2bd5c9:7f90d13250294e4a8c2ab5df9e2e8a29@app.getsentry.com/59248'));
app.use(raven.middleware.express.errorHandler('https://43d873a54a3a4fdbbcc4f23a9c2bd5c9:7f90d13250294e4a8c2ab5df9e2e8a29@app.getsentry.com/59248'));
app.use(onError);

// App listening mode
var port = (process.env.ENV === 'development') ? 80 : 3000;
app.listen(port);