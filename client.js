var dgram = require('dgram');
var client = dgram.createSocket("udp4");
var protocol = require('pomelo-protocol');
var Package = protocol.Package;
var Message = protocol.Message;
var heartbeatInterval = 3000;
var heartbeatTimeout = 6000;
var nextHeartbeatTimeout = 0;
var gapThreshold = 100;
var heartbeatTimeoutId = null;
var handshakeCallback = null;
var heartbeatId = null;

var host = 'localhost';
var port = 3010;

var handshakeBuffer = {
 'sys': {
    type: 'udp-client',
    version: '0.0.1',
    rsa: {}
  },
'user': {
  }
};

var heartbeatData = Package.encode(Package.TYPE_HEARTBEAT);
var handshakeAckData = Package.encode(Package.TYPE_HANDSHAKE_ACK);
var handshakeData = Package.encode(Package.TYPE_HANDSHAKE, protocol.strencode(JSON.stringify(handshakeBuffer)));

var send = function(data, cb) {
  client.send(data, 0, data.length, port, host, function(err, bytes) {
    if(!!err) {
      console.error('udp client send message with error: %j', err.stack);
    }
    if(!!cb) {
      process.nextTick(cb);
    }
  });
};

var sendHandshake = function() {
  send(handshakeData);
};

sendHandshake();

var decode = function(data) {
  var msg = Message.decode(data);
  msg.body = JSON.parse(protocol.strdecode(msg.body));
  return msg;
};

var onData = function(data) {
  var msg = decode(data);
  console.log('receive message from server: %j', msg);
};

var onKick = function(data) {
  data = JSON.parse(protocol.strdecode(data));
  console.log('receive kick data: %j', data);
};

var sendMessage = function(reqId, route, msg) {
  msg = protocol.strencode(JSON.stringify(msg));
  msg = Message.encode(reqId, Message.TYPE_REQUEST, 0, route, msg);
  var packet = Package.encode(Package.TYPE_DATA, msg);
  send(packet);
};

var handshake = function(data) {
  data = JSON.parse(protocol.strdecode(data));
  console.log('receive handshake data: %j', data);
  send(handshakeAckData, function() {
    sendMessage(1, 'connector.entryHandler.entry', {test: 555, route:'connector.entryHandler.entry'});
  });
};

var heartbeat = function(data) {
  console.log('receive heartbeat!');
  if(!heartbeatInterval) {
    return;
  }
  if(heartbeatTimeoutId) {
    clearTimeout(heartbeatTimeoutId);
    heartbeatTimeoutId = null;
  }

  if(heartbeatId) {
    return;
  }
  heartbeatId = setTimeout(function() {
    heartbeatId = null;
    console.log('send heartbeat message!!!');
    send(heartbeatData);
    nextHeartbeatTimeout = Date.now() + heartbeatTimeout;
    heartbeatTimeoutId = setTimeout(heartbeatTimeoutCb, heartbeatTimeout);
  }, heartbeatInterval);
};

var heartbeatTimeoutCb = function() {
  var gap = nextHeartbeatTimeout - Date.now();
  if(gap > gapThreshold) {
    heartbeatTimeoutId = setTimeout(heartbeatTimeoutCb, gap);
  } else {
    console.error('server heartbeat timeout');
  }
};

var processPackage = function(msgs) {
  if(Array.isArray(msgs)) {
    for(var i=0; i<msgs.length; i++) {
      var msg = msgs[i];
      handlers[msg.type](msg.body);
    }
  } else {
    handlers[msgs.type](msgs.body);
  }
};

handlers = {};
handlers[Package.TYPE_HANDSHAKE] = handshake;
handlers[Package.TYPE_HEARTBEAT] = heartbeat;
handlers[Package.TYPE_DATA] = onData;
handlers[Package.TYPE_KICK] = onKick;

client.on("message", function (msg, rinfo) {
  processPackage(Package.decode(msg));
});