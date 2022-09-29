"use strict";

/** Functionality related to chatting. */

// Room is an abstraction of a chat channel
const Room = require("./Room");

const axios = require("axios");

/** ChatUser is a individual connection from client -> server to chat. */

class ChatUser {
  /** Make chat user: store connection-device, room.
   *
   * @param send {function} callback to send message to this user
   * @param room {Room} room user will be in
   * */

  constructor(send, roomName) {
    this._send = send; // "send" function for this user
    this.room = Room.get(roomName); // room user will be in
    this.name = null; // becomes the username of the visitor

    console.log(`created chat in ${this.room.name}`);
  }

  /** Send msgs to this client using underlying connection-send-function.
   *
   * @param data {string} message to send
   * */

  send(data) {
    try {
      this._send(data);
    } catch {
      // If trying to send to a user fails, ignore it
    }
  }

  /** Handle joining: add to room members, announce join.
   *
   * @param name {string} name to use in room
   * */

  handleJoin(name) {
    this.name = name;
    this.room.join(this);
    this.room.broadcast({
      type: "note",
      text: `${this.name} joined "${this.room.name}".`,
    });
  }

  /** Handle a chat: broadcast to room.
   *
   * @param text {string} message to send
   * */

  handleChat(text) {
    this.room.broadcast({
      name: this.name,
      type: "chat",
      text: text,
    });
  }

  /** Handle messages from client:
   *
   * @param jsonData {string} raw message data
   *
   * @example<code>
   * - {type: "join", name: username} : join
   * - {type: "chat", text: msg }     : chat
   * </code>
   */

  async handleMessage(jsonData) {
    let msg = JSON.parse(jsonData);

    if (msg.type === "join") this.handleJoin(msg.name);
    else if (msg.type === "chat") this.handleChat(msg.text);
    else if (msg.type === "joke") await this.handleJoke();
    else if (msg.type === "members") this.handleMembers();
    else if (msg.type === "priv") this.handlePrivateMsg(msg.text);
    else if (msg.type === "name") this.handleNameChange(msg.text);
    else throw new Error(`bad message: ${msg.type}`);
  }

  /** Handle get joke: get a joke, send to this user only */

  async handleJoke() {
    const result = await axios.get("https://icanhazdadjoke.com/", {
      headers: {
        Accept: "application/json",
        "User-Agent": "websocket groupchat exercise",
      },
    });

    const joke = result.data.joke;

    this.send(
      JSON.stringify({
        name: "Server",
        type: "chat",
        text: joke,
      })
    );
  }

  /** Handle get room members:
   * - gets all room members
   * - send member names to this user only
   */

  handleMembers() {
    let members = "In room:";
    for (let member of this.room.members) {
      members += ` ${member.name}`;
    }
    this.send(
      JSON.stringify({
        name: "Server",
        type: "chat",
        text: members,
      })
    );
  }

  /** */

  handlePrivateMsg(text) {
    const data = text.split(" ");
    const toUsername = data[1];
    const message = data.slice(2).join(" ");

    let toUser;

    for (let member of this.room.members) {
      if (member.name === toUsername) toUser = member;
    }

    toUser.send(
      JSON.stringify({
        name: `PM from ${this.name}`,
        type: "chat",
        text: message,
      })
    );

    this.send(
      JSON.stringify({
        name: `You send PM to ${toUser.name}`,
        type: "chat",
        text: message,
      })
    );
  }

  /** Handle changing a username: broadcast change to room. */

  handleNameChange(text) {
    const data = text.split(" ");
    const newUsername = data[1];
    const oldName = this.name;
    
    this.name = newUsername;

    this.room.broadcast({
      type: "note",
      text: `${oldName} changed to "${this.name}".`,
    });
  }

  /** Connection was closed: leave room, announce exit to others. */

  handleClose() {
    this.room.leave(this);
    this.room.broadcast({
      type: "note",
      text: `${this.name} left ${this.room.name}.`,
    });
  }
}

module.exports = ChatUser;
