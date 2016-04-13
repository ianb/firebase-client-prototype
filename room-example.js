/*
Note, there are two kinds of room data:
1. The serialization that is used to sync this data
2. The Javascript objects
*/

const { Record, IMap } = require("immutable");

function makeUuid() {
  // FIXME: fix
  return Math.random() * 1000000;
}

function instantiate(obj, options) {
  let { constructor, desc } = options;
  if (obj === undefined) {
    return new constructor();
  }
  if (obj instanceof constructor) {
    return obj;
  }
  return new constructor(obj);
}

function validateString(s, options) {
  if (s === undefined) {
    return;
  }
  if (options.nullable && s === null) {
    return;
  }
  if (typeof s != "string") {
    throw new Error((options.desc || "property") + " must be a string");
  }
  if (options.notEmpty && ! s) {
    throw new Error((options.desc || "property") + " must not be empty");
  }
}

function validateUrl(s, options) {
  if (s === undefined) {
    return;
  }
  if (options.nullable && s === null) {
    return;
  }
  if (typeof s != "string") {
    throw new Error((options.desc || "URL") + " must be a string");
  }
  if (val.search(/^https?:\/\//i) == -1) {
    throw new Error((options.desc || "URL") + " must start with http(s)", val);
  }
}

function validateDate(date, options) {
  if (date === undefined) {
    return;
  }
  if (options.nullable && date === null) {
    return;
  }
  if (typeof date != "number") {
    throw new Error((options.desc || "Property") + " must be an integer date timestamp");
  }
  // FIXME: check for reasonable range
}

class Room extends Record({title: "", pages: null, chat: null, participants: null}) {
  constructor(props) {
    props = props || {};
    validateString(props.title, {desc: "Room title", nullable: true});
    props.pages = instantiate(props.pages, {desc: "pages", constructor: Pages});
    props.chat = instantiate(props.chat, {desc: "chat", constructor: Chat});
    props.participants = instantiate(props.participants, {desc: "participants", constructor: Participants});
    super(props);
  }

  // FIXME: these might be handled with .setIn()
  addPage(page) {
    page = instantiate(page, {desc: "Added page", constructor: Page});
    return this.set('pages', this.pages.set(page.id, page));
  }

  extendChat(messages) {
    return this.set('chat', this.chat.extend(messages));
  }
}

class Pages extends IMap {
  constructor(items) {
    items = Object.assign({}, items || {});
    for (let key in items) {
      let value = items[key];
      items[key] = instantiate(value, {desc: "Page " + key, constructor: Page, assign: {id: key}});
    }
    super(items);
  }
}

class Page extends Record({id: null, url: null, canonicalUrl: null, title: null, openGraph: null, twitterCard: null, meta: null, created: null, creatorId: null, images: null}) {
  constructor(props) {
    props = props || {};
    if (! props.id) {
      throw new Error("You must provide an id");
    } else if (typeof props.id != "string") {
      throw new Error("Page id must be string");
    }
    validateUrl(props.url, {desc: "Page url", nullable: true});
    validateString(props.title, {desc: "Page title", nullable: true});
    props.openGraph = instantiate(props.openGraph, {desc: "Page openGraph", constructor: OpenGraph});
    props.twitterCard = instantiate(props.twitterCard, {desc: "Page twitterCard", constructor: TwitterCard});
    props.meta = instantiate(props.meta, {desc: "Page meta", constructor: PageMeta});
    validateDate(props.created);
    if (props.creator) {
      if (! (props.creator instanceof Person)) {
        throw new Error("Page creator must be a Person");
      }
      props.creatorId = Person.id;
      delete props.creator;
    }
    validateString(props.creatorId, {desc: "Page creatorId", nullable: true});
    props.images = instantiate(props.images, {desc: "Page images", constructor: Images});
  }

}

class OpenGraph extends Record({type: null, title: null, description: null, images: null, author: null, tags: null}) {
  constructor(props) {
    props = props || {};
    validateString(props.type, {desc: "OpenGraph type", nullable: true});
    validateString(props.title, {desc: "OpenGraph title", nullable: true});
    validateString(props.description, {desc: "OpenGraph description", nullable: true});
    props.images = instantiate(props.images, {desc: "OpenGraph images", constructor: Images});
    validateString(props.author, {desc: "OpenGraph author", nullable: true});
    // FIXME: figure out what tags should be
  }
}

class TwitterCard extends Record({card: null, site: null}) {
  // FIXME: add more attributes
  constructor(props) {
    props = props || {};
    validateString(props.card, {desc: "TwitterCard card", nullable: true});
    validateString(props.site, {desc: "TwitterCard site", nullable: true});
  }
}

class PageMeta extends Record({description: null}) {
  // FIXME: add more attributes
  constructor(props) {
    props = props || {};
    validateString(props.description, {desc: "PageMeta description", nullable: true});
  }
}

class Chat {
  constructor(messages, force) {
    if (force) {
      this._list = force.list;
      this._ids = force.id;
      return;
    }
    let chatItems = [];
    let chatIds = {};
    if (messages) {
      for (let message of messages) {
        message = instantiate(message, {desc: "Chat message", constructor: makeMessage});
        chatIds[message.id] = message;
        chatItems.push(message);
      }
      chatItems.sort(function (a, b) {
        return b.created < a.created ? -1 : 1;
      });
    }
    this._list = List(chatItems);
    this._ids = IMap(chatIds);
  }

  remove(item) {
    throw new Error("Not implemented");
  }

  extend(items) {
    if (! items.length) {
      return this;
    }
    items = items.map(function (item) {
      return instantiate(item, {desc: "Chat message", constructor: makeMessage});
    }).sort(function (a, b) {
      return b.created < a.created ? -1 : 1;
    });
    let newList = Array.from(this._list);
    newList = newList.concat(items);
    // FIXME: don't always need to sort
    newList.sort(function (a, b) {
      return b.created < a.created ? -1 : 1;
    });
    let newIds = this._ids.withMutations(function (map) {
      for (let item of items) {
        map.set(item.id, item);
      }
    });
    return new Chat(null, {ids: newIds, list: newList});
  }
}

function makeMessage(obj) {
  if (! obj.id) {
    throw new Error("Messages must have ids");
  } else if (typeof obj != "string") {
    throw new Error("Message ids must be strings");
  }
  if (! obj.type) {
    throw new Error("Messages must have types");
  } else if (typeof obj != "string") {
    throw new Error("Message types must be a string");
  }
  let Class = ChatMessages.subclasses[obj.type];
  if (! Class) {
    throw new Error("No such message type: " + obj.type);
  }
  return new Class(obj);
}

class ChatMessage extends Record({id: null, type: null, creator: null, created: null, text: null, page: null, finished: null, participants: null}) {
  constructor(props) {
    // FIXME: check
    super(props);
  }
}
ChatMessage.subclasses = {};

class TextMessage extends ChatMessage {
}
TextMessage.prototype.type = "text";
ChatMessage.subclasses.text = TextMessage;

class VisitMessage extends ChatMessage {
}
VisitMessage.prototype.type = "visit";
ChatMessage.subclasses.visit = VisitMessage;

class LeaveMessage extends ChatMessage {
}
LeaveMessage.prototype.type = "leave";
ChatMessage.subclasses.leave = LeaveMessage;

class JoinMessage extends ChatMessage {
}
JoinMessage.prototype.type = "join";
ChatMessage.subclasses.join = JoinMessage;

class TabShareMessage extends ChatMessage {
}
TabShareMessage.prototype.type = "tabShare";
ChatMessage.subclasses.tabShare = TabShareMessage;

class Person extends Record({id: null, displayName: null, color: null, initials: null, avatar: null, inRoom: null, entered: null, lastPing: null, left: null}) {
}

class Image extends Record({id: null, url: null, width: null, height: null, alt: null, title: null}) {
}
