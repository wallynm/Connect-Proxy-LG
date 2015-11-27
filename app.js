var qs      = require('querystring');
var express = require('express');
var cors    = require('cors');
var request = require('request');
var raven   = require('raven');
var _       = require('lodash');
var Q       = require('q');
var shortid = require('shortid');
var bodyParser = require('body-parser');
var mongojs = require('mongojs');
var db      = mongojs('connect');
var authCollection = db.collection('userauth');

// Modules
var twitterAPI = require('./modules/twitter');
var app = express();
app.use(cors({origin: '*'}));
app.use(express.static(process.cwd() + '/public'));
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());


app.get('/geodata', function(req, res) {
  var auth = {
    token: req.query.token,
    secret: req.query.secret
  };

  request.get({url: 'http://ip-api.com/json'}, function(e, r, body) {
    var geoObject = JSON.parse(body);
    twitterAPI.getWoeid({long: geoObject.lon, lat: geoObject.lat}, auth)
    .then(function(data){
      data = data[0];
      geoObject.country = data.country;
      geoObject.countryCode = data.countryCode;
      geoObject.name = data.name;
      geoObject.parentid = data.parentid;
      geoObject.placeType = data.placeType;
      geoObject.woeid = data.woeid;
      res.send(geoObject);
    });
  });
});


app.get('/twitter/trend', function(req, res) {
  console.log('app route -> /twitter/trend');
  var placeid = req.query.placeid || 1;
  var auth = {
    token: req.query.token,
    secret: req.query.secret
  };

  twitterAPI.getTrendingTopics(placeid, auth)
  .then(function(body){
    res.json(body);
  })
});

app.get('/twitter/search/tweets', function(req, res) {
  console.log('app route -> /twitter/search/tweets');
  var placeid = req.query.placeid || 1;
  var auth = {
    token: req.query.token,
    secret: req.query.secret
  };

  twitterAPI.getTrendingTopics(placeid, auth)
  .then(function(trendingTopics) {
    var trends = trendingTopics.trends;
    var query = _.sample(trends, 3).join(' OR ');
    
    twitterAPI.queryTweets(query, placeid, auth)
    .then(function(body){
      res.send(body);
    });
  });
});

app.get('/twitter/timeline', function(req, res) {
  var auth = {
    token: req.query.token,
    secret: req.query.secret
  };

  twitterAPI.geHomeTimeline(auth)
  .then(function(timeline) {
    res.send(timeline);
  });
});


/**
 * Generate URL Auth token and redirects user to Twitter PIN Page
 */
app.get('/twitter/device/:key?', function(req, res) {
  var key = req.params.key;

  if(_.isUndefined(key)){
    res.send('Oops. Parece que você não informou a url completa, tente verificar se a url está igual a exibida na sua TV LG.');
    return;
  }

  authCollection.findOne({shortkey: key}, function(err, doc) {
    if(_.isUndefined(doc)) {
      res.send('Oops. Confira se os ultimos valores da URL informada estão certos, caso sejam iguais tente acessar novamente a tela de login na sua TV LG.');
      return;
    }

    res.redirect('https://api.twitter.com/oauth/authenticate' + '?' + qs.stringify({oauth_token: doc.oauth_token}));
  });
});


// Gera a token no server e prepara os 
// dados para validar a token do usuario
app.get('/twitter/url_device', function(req, res) {
  twitterAPI.authRequestPinUrl()
  .then(function(result) {
    res.send(result);
  });
});

// Gera a token no server e prepara os 
app.post('/twitter/device/auth', function(req, res) {
  twitterAPI.authPinUser(req.body)
  .then(function(result) {
    res.send(result);
  });
});




// /**
//  * Method used to control error handling
//  */
// function onError(err, req, res, next) {
//   res.statusCode = 500;
//   res.end(res.sentry+'\n');
// }

// // Ravenjs configure
// app.use(raven.middleware.express.requestHandler('https://43d873a54a3a4fdbbcc4f23a9c2bd5c9:7f90d13250294e4a8c2ab5df9e2e8a29@app.getsentry.com/59248'));
// app.use(raven.middleware.express.errorHandler('https://43d873a54a3a4fdbbcc4f23a9c2bd5c9:7f90d13250294e4a8c2ab5df9e2e8a29@app.getsentry.com/59248'));
// app.use(onError);

// App listening mode
app.listen(3000);