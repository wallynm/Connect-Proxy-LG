var qs = require('querystring');
var express = require('express');
var request = require('request');
var storage = require('node-persist');
var raven = require('raven');
var _ = require('lodash');
var Q = require('q');
var shortid = require('shortid');

var mongojs = require('mongojs');
var db = mongojs('connect');
var Twit = require('twit');

var authCollection = db.collection('userauth');
var authBulk = authCollection.initializeOrderedBulkOp();
var trendsCollection = db.collection('trends');
var trendsBulk = trendsCollection.initializeOrderedBulkOp();
var tweetsCollection = db.collection('tweets');
var tweetsBulk = tweetsCollection.initializeOrderedBulkOp();


// Find all documents created after midnight on May 25th, 1980
// db.mycollection.find({ _id: { $gt: helper.objectIdWithTimestamp('1980/05/25') } });
// db.requests.find({timestamp: {$lt: new Date((new Date())-1000*60*60*72)}}).count()


storage.init({
  dir: '../store',
  stringify: JSON.stringify,
  parse: JSON.parse,
  encoding: 'utf8',
});

var config = {
  "consumerKey": "vZPfoRahVcPOPKNtzHRjqeQwZ",
  "consumerSecret": "L29qez89jTSet6NzEuo0iqi6UvmvgPOnyqG5LDSj36sNR8iQDs",
}

// var T = new Twit({
//   consumer_key:         '...', 
//   consumer_secret:      '...', 
//   access_token:          '...', 
//   access_token_secret:  '...'
// })

//Get this data from your twitter apps dashboard
exports.config = config;

var twitterAppKey = new Buffer(encodeURIComponent(config.consumerKey) + ':' + encodeURIComponent(config.consumerSecret)).toString('base64');

/**
 * Auths the app to make the basic requests and stores basic token for control in app
 * @return {[type]}            [description]
 */
exports.getTokenOauth = function(parameters) {
  var defer = Q.defer();
  var oauthRes = storage.getItem('twitterAppOauthResponse');

  if(!_.isUndefined(parameters) && !_.isEmpty(parameters)) {
    defer.resolve(parameters);
  }

  if (_.isUndefined(oauthRes) || _.isEmpty(oauthRes)) {
    request.post({
      url: 'https://api.twitter.com/oauth2/token',
      headers: {
        'Authorization': 'Basic ' + twitterAppKey,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: 'grant_type=client_credentials'
    }, function(error, response, body) {
      if (!error && response.statusCode == 200) {
        oauthRes = JSON.parse(body);
        storage.setItem('twitterAppOauthResponse', oauthRes);
        defer.resolve(oauthRes);
      } else {
        throw new Error(body);
      }
    });

  } else {
    defer.resolve(oauthRes);
  }

  return defer.promise;
}


exports.getTrendingTopics = function(oauthRes, placeID) {
  var defer = Q.defer();
  var date = getPastMinutes(10);
  clearOldTrends(date);

  trendsCollection.findOne({timestamp: {$gt: date}, 'locations.0.woeid': placeID}, function(err, doc) {
    if (_.isUndefined(doc) || _.isEmpty(doc)) {

      oauthRes.consumer_key = config.consumerKey;
      var requestObject = {
        url: 'https://api.twitter.com/1.1/trends/place.json',
        qs: {
          id: placeID
        }
      };

      if(oauthRes.token_type === 'bearer') {
        requestObject.headers =  {'Authorization': _.capitalize(oauthRes.token_type) + ' ' + oauthRes.access_token};
      } else {
        requestObject.headers =  {
          'Authorion': 'OAuth oauth_consumer_key="vZPfoRahVcPOPKNtzHRjqeQwZ", oauth_nonce="d003540bb9afc68c07e87907d200509b", oauth_signature="LQHKImuWquH%2BT1Lzv9LHjeFXPas%3D", oauth_signature_method="HMAC-SHA1", oauth_timestamp="1448546794", oauth_token="197243204-dSpcZmy6sLmtb2UeN40pkcxiT6DK43H36UYEKDN1", oauth_version="1.0"'
        };
        // requestObject.oauth = oauthRes;
      }

      request.get(requestObject, function(error, response, body) {
        console.warn(response)
        console.warn(requestObject)
        console.warn(error)


        if (!error && response.statusCode == 200) {
          var object = JSON.parse(body)[0];
          object.timestamp = new Date();
          trendsCollection.insert(object);
          defer.resolve(object);
        } else {
          throw new Error(body);
          defer.reject();
        }
      });
    } else {
      defer.resolve(doc);
    }
  });
  return defer.promise;
}

exports.queryTweets = function(oauthRes, query, placeID) {
  var defer = Q.defer();
  var date = getPastMinutes(1);
  clearOldTweets(date);

  tweetsCollection.findOne({timestamp: {$gt: date}}, function(err, doc) {
    if (_.isUndefined(doc) || _.isEmpty(doc)) {

      oauthRes.consumer_key = config.consumerKey;
      var requestObject = {
        url: 'https://api.twitter.com/1.1/search/tweets.json',
        qs: {
          count: 100,
          q: query
        }
      };

      if(oauthRes.token_type === 'bearer') {
        requestObject.headers =  {'Authorization': _.capitalize(oauthRes.token_type) + ' ' + oauthRes.access_token};
      } else {
        requestObject.headers =  {'Authorization': 'OAuth oauth_consumer_key="vZPfoRahVcPOPKNtzHRjqeQwZ", oauth_nonce="d003540bb9afc68c07e87907d200509b", oauth_signature="LQHKImuWquH%2BT1Lzv9LHjeFXPas%3D", oauth_signature_method="HMAC-SHA1", oauth_timestamp="1448546794", oauth_token="197243204-dSpcZmy6sLmtb2UeN40pkcxiT6DK43H36UYEKDN1", oauth_version="1.0"'};
        // requestObject.oauth = oauthRes;
      }

      request.get(requestObject, function(error, response, body) {
        console.warn(response)
        if (!error && response.statusCode == 200) {
          tweets = JSON.parse(body);
          tweets.timestamp = new Date();
          tweetsCollection.insert(tweets);
          defer.resolve(tweets);
        } else {
          throw new Error(body);
        }
      });

    } else {
      // Return the cached value
      defer.resolve(doc);
    }
  });

  return defer.promise;
}


/**
 * Generates PIN Url
 */
exports.authRequestPinUrl = function() {
  var defer = Q.defer();
  clearOldKeys();
  var oauth = {
    callback: 'oob',
    consumer_key: config.consumerKey,
    consumer_secret: config.consumerSecret
  }

  request.post({url: 'https://api.twitter.com/oauth/request_token', oauth: oauth}, function(e, r, body) {
    var req_data = qs.parse(body);

    var object = {
      oauth_token : req_data.oauth_token,
      oauth_token_secret : req_data.oauth_token_secret,
      shortkey: shortid.generate().toUpperCase(),
      timestamp: new Date(),
      type: 'twitter'
    };

    authCollection.insert(object);
    defer.resolve(object);
  });

  return defer.promise;
}

/**
 * Receives user PIN data and auth the system
 */
exports.authPinUser = function(data) {
  var defer = Q.defer();

  var oauth = {
    consumer_key: config.consumerKey,
    consumer_secret: config.consumerSecret,
    token: data.oauth_token,
    token_secret: data.oauth_token_secret,
    verifier: data.PIN
  };

  request.post({url: 'https://api.twitter.com/oauth/access_token', oauth: oauth}, function(e, r, body) {
    defer.resolve(qs.parse(body));
  });

  return defer.promise;
}

getPastMinutes = function(minutes){
  var date = new Date();
  return new Date(date.setMinutes(date.getMinutes() - minutes));
}


clearOldTweets = function(date) {
  tweetsBulk.find({timestamp: {$lt: date}}).remove();
  tweetsBulk.execute(function () {});
}

clearOldTrends = function(date) {
  // trendsBulk.find({timestamp: {$lt: date}}).remove();
  // trendsBulk.execute(function () {});
}

clearOldKeys = function() {
  var date = getPastMinutes(5);
  authBulk.find({timestamp: {$lt:date}}).remove();
  authBulk.execute(function () {});
}