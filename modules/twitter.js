var qs = require('querystring');
var express = require('express');
var request = require('request');
var storage = require('node-persist');
var raven   = require('raven');
var _       = require('lodash');
var Q       = require('q');

storage.init({
  dir:'../store',
  stringify: JSON.stringify,
  parse: JSON.parse,
  encoding: 'utf8',
});

var config = {
  "consumerKey": "vZPfoRahVcPOPKNtzHRjqeQwZ",
  "consumerSecret": "L29qez89jTSet6NzEuo0iqi6UvmvgPOnyqG5LDSj36sNR8iQDs",
}

 //Get this data from your twitter apps dashboard
exports.config;

var twitterAppKey = new Buffer(encodeURIComponent(config.consumerKey) + ':' + encodeURIComponent(config.consumerSecret)).toString('base64');

/**
 * Auths the app to make the basic requests and stores basic token for control in app
 * @return {[type]}            [description]
 */
exports.getTokenApp = function() {
  var defer = Q.defer();
  var oauthRes = storage.getItem('twitterAppOauthResponse');

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
  var storageKey = 'twitter_trending_' + placeID;
  var trending = storage.getItem(storageKey);

  if (_.isUndefined(trending) || _.isEmpty(trending)) {

    request.get({
      url: 'https://api.twitter.com/1.1/trends/place.json',
      headers: {
        'Authorization': _.capitalize(oauthRes.token_type) + ' ' + oauthRes.access_token,
      },
      qs: {
        id: placeID
      },
    },
    function(error, response, body) {
      if (!error && response.statusCode == 200) {
        trending = JSON.parse(body);
        trending[0].timestamp = new Date();
        storage.setItem(storageKey, trending);
        defer.resolve(trending);
      } else {
        throw new Error(body);
        defer.reject();
      }
    });
  } else {
    defer.resolve(trending);
  }

  return defer.promise;
}

exports.queryTweets = function(oauthRes, placeID, query) {
  var defer = Q.defer();
  var storageKey = 'twitter_search_' + placeID;
  var tweets = storage.getItem(storageKey);

  if (_.isUndefined(tweets) || _.isEmpty(tweets)) {
    request.get({
      url: 'https://api.twitter.com/1.1/search/tweets.json',
      headers: {
        'Authorization': _.capitalize(oauthRes.token_type) + ' ' + oauthRes.access_token,
      },
      qs: {
        q: query
      }
    }, 
    function(error, response, body) {
      if (!error && response.statusCode == 200) {
        tweets = JSON.parse(body);
        tweets.timestamp = new Date();
        storage.setItem(storageKey, tweets);        
        defer.resolve(tweets);
      } else {
        throw new Error(body);
      }
    });
  } else {
    defer.resolve(tweets);
  }

  return defer.promise;
}

exports.authRequestPinUrl = function() {
  var defer = Q.defer();
  var oauth = { 
    callback: 'oob', 
    consumer_key: config.consumerKey, 
    consumer_secret: config.consumerSecret
  }

  request.post({url:'https://api.twitter.com/oauth/request_token', oauth:oauth}, function (e, r, body) {
    var req_data = qs.parse(body)
    var uri = 'https://api.twitter.com/oauth/authenticate' + '?' + qs.stringify({oauth_token: req_data.oauth_token})
    defer.resolve(uri);


    // // request.get({url: uri}, function(e, r, body){
    // //   defer.resolve(body);
    // // })


    // // step 3
    // // after the user is redirected back to your server
    // var auth_data = qs.parse(body)
    //   , oauth =
    //     { consumer_key: config.consumerKey
    //     , consumer_secret: config.consumerSecret
    //     , token: auth_data.oauth_token
    //     , token_secret: req_data.oauth_token_secret
    //     // , verifier: auth_data.oauth_verifier
    //     }
    //   , url = 'https://api.twitter.com/oauth/access_token'
    //   ;
    // request.post({url:url, oauth:oauth}, function (e, r, body) {
    //   // console.log(body)
    //   // defer.resolve(body);
    // })
  });

  return defer.promise;
}
