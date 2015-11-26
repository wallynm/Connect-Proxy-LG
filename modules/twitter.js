var qs = require('querystring');
var express = require('express');
var request = require('request');
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


var config = {
  "consumerKey": "vZPfoRahVcPOPKNtzHRjqeQwZ",
  "consumerSecret": "L29qez89jTSet6NzEuo0iqi6UvmvgPOnyqG5LDSj36sNR8iQDs",
}

var Tweet = new Twit({
  consumer_key: config.consumerKey, 
  consumer_secret: config.consumerSecret, 
  app_only_auth: true
});

var authTweet = function(data) {
  return new Twit({
    consumer_key: config.consumerKey, 
    consumer_secret: config.consumerSecret,
    access_token: data.token,
    access_token_secret: data.secret
  });
};

exports.getTrendingTopics = function(placeID, auth) {
  var defer = Q.defer();
  var date = getPastMinutes(10);
  clearOldTrends(date);

  trendsCollection.findOne({timestamp: {$gt: date}, 'locations.0.woeid': placeID}, function(err, doc) {
    if (_.isUndefined(doc) || _.isEmpty(doc)) {

      if(!_.isEmpty(auth) || !_.isUndefined(auth))
        Tweet = authTweet(auth);

      Tweet.get('trends/place', {id: placeID}, function(err, data, response){
        var object = data[0];
        object.timestamp = new Date();
        trendsCollection.insert(object);
        defer.resolve(object);
      });
    } else {
      defer.resolve(doc);
    }
  });
  return defer.promise;
}

exports.queryTweets = function(query, placeID, auth) {
  var defer = Q.defer();
  var date = getPastMinutes(1);
  var mongoQuery = {timestamp: {$gt: date}};

  if(!_.isEmpty(auth) || !_.isUndefined(auth)){
    Tweet = authTweet(auth);
    mongoQuery.token = auth.token;
  }

  clearOldTweets(date);
  tweetsCollection.findOne(mongoQuery, function(err, doc) {
    if (_.isUndefined(doc) || _.isEmpty(doc)) {
      Tweet.get('search/tweets', {count: 100, q: query}, function(err, data, response){
        data.timestamp = new Date();
        data.token = auth.token;
        tweetsCollection.insert(data);
        defer.resolve(data);
      });

    } else {
      defer.resolve(doc);
    }
  });

  return defer.promise;
}

exports.geHomeTimeline = function(auth) {
  var defer = Q.defer();

  if(!_.isEmpty(auth) || !_.isUndefined(auth)){
    Tweet = authTweet(auth);
  }

  Tweet.get('statuses/home_timeline', {count: 200}, function(err, data, response){
    defer.resolve(data);
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