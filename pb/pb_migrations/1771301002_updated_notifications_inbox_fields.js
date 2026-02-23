/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2301922722")

  const has = (name) => {
    try {
      return !!collection.fields.getByName(name)
    } catch {
      return false
    }
  }

  if (!has("kind")) {
    collection.fields.addAt(6, new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_notification_kind",
      "max": 0,
      "min": 0,
      "name": "kind",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
  }

  if (!has("title")) {
    collection.fields.addAt(7, new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_notification_title",
      "max": 0,
      "min": 0,
      "name": "title",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
  }

  if (!has("url")) {
    collection.fields.addAt(8, new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_notification_url",
      "max": 0,
      "min": 0,
      "name": "url",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
  }

  if (!has("readAt")) {
    collection.fields.addAt(9, new Field({
      "hidden": false,
      "id": "date_notification_readAt",
      "max": "",
      "min": "",
      "name": "readAt",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "date"
    }))
  }

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2301922722")

  collection.fields.removeByName("kind")
  collection.fields.removeByName("title")
  collection.fields.removeByName("url")
  collection.fields.removeByName("readAt")

  return app.save(collection)
})

