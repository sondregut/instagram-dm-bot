const deny=()=>{throw Error('Outbound network forbidden in offline regression tests')};
global.fetch=deny;require('node:net').Socket.prototype.connect=deny;
require('node:http').request=deny;require('node:http').get=deny;require('node:https').request=deny;require('node:https').get=deny;require('node:http2').connect=deny;
