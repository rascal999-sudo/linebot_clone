'use strict'; // Required to use class in node v4

const EventEmitter = require('events');
const fetch = require('node-fetch');
const crypto = require('crypto');
const http = require('http');
const bodyParser = require('body-parser');
const debug = require('debug')('linebot');

class LineBot extends EventEmitter {

  constructor(options) {
    super();
    this.options = options || {};
    this.options.channelId = options.channelId || '1655577582';
    this.options.channelSecret = options.channelSecret || 'a6cb3ed2579015999f517845b7eb9e3e';
    this.options.channelAccessToken = options.channelAccessToken || 'CLik/GUyMRxlSY3UvOsm/BX3z8eI27c1bL6MmtM7845+aeeshy3MEjskLyMga/UbKRgtCia39kv7om1PqpOuI/EcL1gpf4yWkgM6N0fWto8fGLhoQypHt2gETU6ShSihl0d69FvCU7zdZyJy9DEoSgdB04t89/1O/w1cDnyilFU=';
    if (this.options.verify === undefined) {
      this.options.verify = false;
    }
    this.headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + this.options.channelAccessToken
    };
    this.endpoint = 'https://api.line.me/v2/bot';
    this.dataEndpoint = 'https://api-data.line.me/v2/bot';
  }

  verify(rawBody, signature) {
    console.log('**verify in ');
    const hash = crypto.createHmac('sha256', this.options.channelSecret)
      .update(rawBody, 'utf8')
      .digest('base64');
    // Constant-time comparison to prevent timing attack.
    if (hash.length !== signature.length) {
      return false;
    }
    let res = 0;
    for (let i = 0; i < hash.length; i++) {
      res |= (hash.charCodeAt(i) ^ signature.charCodeAt(i));
    }
    return res === 0;
  }

  parse(body) {
    const that = this;
    console.log('**parse in ');
    console.log('**body=',body);
    if (!body || !body.events) {
    console.log('**body.event=%0',body.event);
      return;
    }
    console.log('**events foreach ');
    body.events.forEach(function(event) {
      debug('%O', event);
      console.log('**%O', event);
      event.reply = function (message) {
        console.log('**return reply');
        return that.reply(event.replyToken, message);
      };
    console.log('**if event.source');
    console.log('**event.source=%0',event.source);
      if (event.source) {
        event.source.profile = function() {
          if (event.source.type === 'group') {
            return that.getGroupMemberProfile(event.source.groupId, event.source.userId);
          }
          if (event.source.type === 'room') {
            return that.getRoomMemberProfile(event.source.roomId, event.source.userId);
          }
          return that.getUserProfile(event.source.userId);
        };
        event.source.member = function() {
          if (event.source.type === 'group') {
            return that.getGroupMember(event.source.groupId);
          }
          if (event.source.type === 'room') {
            return that.getRoomMember(event.source.roomId);
          }
        };
      }
    console.log('**if event.message');
    console.log('**event.message=%0',event.message);
      if (event.message) {
        event.message.content = function() {
          return that.getMessageContent(event.message.id);
        };
      }
      process.nextTick(function() {
        that.emit(event.type, event);
      });
    });
  }

  static createMessages(message) {
    if (typeof message === 'string') {
      return [{ type: 'text', text: message }];
    }
    if (Array.isArray(message)) {
      return message.map(function(m) {
        if (typeof m === 'string') {
          return { type: 'text', text: m };
        }
        return m;
      });
    }
    return [message];
  }

  reply(replyToken, message) {
    const url = '/message/reply';
    const body = {
      replyToken: replyToken,
      messages: LineBot.createMessages(message)
    };
    debug('POST %s', url);
    debug('%O', body);
    return this.post(url, body).then(res => res.json()).then((result) => {
      debug(result);
      return result;
    });
  }

  push(to, message) {
    const url = '/message/push';
    console.log('**push event in ');
    if (Array.isArray(to)) {
      return Promise.all(to.map(recipient => this.push(recipient, message)));
    }
    const body = {
      to: to,
      messages: LineBot.createMessages(message)
    };
    debug('POST %s', url);
    debug('%O', body);
    return this.post(url, body).then(res => res.json()).then((result) => {
      debug('%O', result);
      return result;
    });
  }

  multicast(to, message) {
    const url = '/message/multicast';
    const body = {
      to: to,
      messages: LineBot.createMessages(message)
    };
    debug('POST %s', url);
    debug('%O', body);
    return this.post(url, body).then(res => res.json()).then((result) => {
      debug('%O', result);
      return result;
    });
  }

  broadcast(message){
    const url = '/message/broadcast';
    const body = {
      messages: LineBot.createMessages(message)
    };
    debug('POST %s', url);
    debug('%O', body);
    return this.post(url, body).then(res => res.json()).then((result) => {
      debug('%O', result);
      return result;
    });
  }

  getMessageContent(messageId) {
    const url = `/message/${messageId}/content`;
    debug('GET %s', url);
    return this.getData(url).then(res => res.buffer()).then((buffer) => {
      debug(buffer.toString('hex'));
      return buffer;
    });
  }

  getUserProfile(userId) {
    const url = `/profile/${userId}`;
    debug('GET %s', url);
    return this.get(url).then(res => res.json()).then((profile) => {
      debug('%O', profile);
      return profile;
    });
  }

  getGroupMemberProfile(groupId, userId) {
    const url = `/group/${groupId}/member/${userId}`;
    debug('GET %s', url);
    return this.get(url).then(res => res.json()).then((profile) => {
      debug('%O', profile);
      profile.groupId = groupId;
      return profile;
    });
  }

  getGroupMember(groupId, next) {
    const url = `/group/${groupId}/members/ids` + (next ? `?start=${next}` : '');
    debug('GET %s', url);
    return this.get(url).then(res => res.json()).then((groupMember) => {
      debug('%O', groupMember);
      if (groupMember.next) {
        return this.getGroupMember(groupId, groupMember.next).then((nextGroupMember) => {
          groupMember.memberIds = groupMember.memberIds.concat(nextGroupMember.memberIds);
          delete groupMember.next;
          return groupMember;
        });
      }
      delete groupMember.next;
      return groupMember;
    });
  }

  leaveGroup(groupId) {
    const url = `/group/${groupId}/leave`;
    debug('POST %s', url);
    return this.post(url).then(res => res.json()).then((result) => {
      debug('%O', result);
      return result;
    });
  }

  getRoomMemberProfile(roomId, userId) {
    const url = `/room/${roomId}/member/${userId}`;
    debug('GET %s', url);
    return this.get(url).then(res => res.json()).then((profile) => {
      debug('%O', profile);
      profile.roomId = roomId;
      return profile;
    });
  }

  getRoomMember(roomId, next) {
    const url = `/room/${roomId}/members/ids` + (next ? `?start=${next}` : '');
    debug('GET %s', url);
    return this.get(url).then(res => res.json()).then((roomMember) => {
      debug('%O', roomMember);
      if (roomMember.next) {
        return this.getRoomMember(roomId, roomMember.next).then((nextRoomMember) => {
          roomMember.memberIds = roomMember.memberIds.concat(nextRoomMember.memberIds);
          delete roomMember.next;
          return roomMember;
        });
      }
      delete roomMember.next;
      return roomMember;
    });
  }

  leaveRoom(roomId) {
    const url = `/room/${roomId}/leave`;
    debug('POST %s', url);
    return this.post(url).then(res => res.json()).then((result) => {
      debug('%O', result);
      return result;
    });
  }

  getTotalFollowers(date) {
    if (date == null) {
      date = yesterday();
    }
    const url = `/insight/followers?date=${date}`;
    debug('GET %s', url);
    return this.get(url).then(res => res.json()).then((result) => {
      debug('%O', result);
      return result;
    });
  }

  getQuota() {
    const url = '/message/quota';
    debug('GET %s', url);
    return this.get(url).then(res => res.json()).then((result) => {
      debug('%O', result);
      return result;
    });
  }

  getTotalReplyMessages(date) {
    return this.getTotalMessages(date, 'reply');
  }

  getTotalPushMessages(date) {
    return this.getTotalMessages(date, 'push');
  }

  getTotalBroadcastMessages(date) {
    return this.getTotalMessages(date, 'broadcast');
  }

  getTotalMulticastMessages(date) {
    return this.getTotalMessages(date, 'multicast');
  }

  getTotalMessages(date, type) {
    if (date == null) {
      date = yesterday();
    }
    const url = `/message/delivery/${type}?date=${date}`;
    debug('GET %s', url);
    return this.get(url).then(res => res.json()).then((result) => {
      debug('%O', result);
      return result;
    });
  }

  get(path) {
    const url = this.endpoint + path;
    const options = { method: 'GET', headers: this.headers };
    return fetch(url, options);
  }

  getData(path) {
    const url = this.dataEndpoint + path;
    const options = { method: 'GET', headers: this.headers };
    return fetch(url, options);
  }

  post(path, body) {
    const url = this.endpoint + path;
    const options = { method: 'POST', headers: this.headers, body: JSON.stringify(body) };
    return fetch(url, options);
  }

  // Optional Express.js middleware
  parser() {
    const parser = bodyParser.json({
      verify: function (req, res, buf, encoding) {
        req.rawBody = buf.toString(encoding);
      }
    });
    return (req, res) => {
      parser(req, res, () => {
        if (this.options.verify && !this.verify(req.rawBody, req.get('X-Line-Signature'))) {
          return res.sendStatus(400);
        }
        this.parse(req.body);
        return res.json({});
      });
    };
  }

  // Optional built-in http server
  listen(path, port, callback) {
    console.log('**listen in ');
    const parser = bodyParser.json({
      verify: function (req, res, buf, encoding) {
        req.rawBody = buf.toString(encoding);
      }
    });
    const server = http.createServer((req, res) => {
      const signature = req.headers['x-line-signature']; // Must be lowercase
      res.setHeader('X-Powered-By', 'linebot');
      console.log('**req.method=%s',req.method);
      if (req.method === 'POST' && req.url === path) {
        parser(req, res, () => {
          console.log('**parse out after ');
//          console.log('**req=%O', req);
//          console.log('**sig=%O', signature);

// [X-Line-Signature]の評価はしない。基幹システムからのメッセージを想定
//          if (this.options.verify && !this.verify(req.rawBody, signature)) {
//            res.statusCode = 400;
//            res.setHeader('Content-Type', 'text/html; charset=utf-8');
//            return res.end('Bad request');
//          }
          this.parse(req.body);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          return res.end('{}');
        });
      } else {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end('Not found');
      }
    });
    console.log("**callback");
    return server.listen(port, callback);
  }

} // class LineBot

function createBot(options) {
  return new LineBot(options);
}

function yesterday() {
  const tempDate = new Date();
  tempDate.setDate(tempDate.getDate() - 1);
  const yesterday = tempDate.toLocaleString('en-US', {
    timeZone: 'Asia/Tokyo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  return yesterday.substr(6, 4) + yesterday.substr(0, 2) + yesterday.substr(3, 2);
}

module.exports = createBot;
module.exports.LineBot = LineBot;
