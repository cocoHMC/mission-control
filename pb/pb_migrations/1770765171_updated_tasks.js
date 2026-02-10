/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2602490748")

  // NOTE: Some Mission Control builds also patch schema at runtime (pb_bootstrap).
  // Make this migration idempotent so upgrades don't fail when fields already exist.
  const has = (name) => {
    try {
      return !!collection.fields.getByName(name)
    } catch {
      return false
    }
  }

  if (!has("vaultItem")) {
    collection.fields.addAt(27, new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text715664714",
      "max": 0,
      "min": 0,
      "name": "vaultItem",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
  }

  if (!has("aiThinking")) {
    collection.fields.addAt(28, new Field({
      "hidden": false,
      "id": "select3458886328",
      "maxSelect": 1,
      "name": "aiThinking",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "select",
      "values": [
        "auto",
        "low",
        "medium",
        "high",
        "xhigh"
      ]
    }))
  }

  if (!has("aiModel")) {
    collection.fields.addAt(29, new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text1327524989",
      "max": 0,
      "min": 0,
      "name": "aiModel",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
  }

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2602490748")

  collection.fields.removeByName("vaultItem")
  collection.fields.removeByName("aiThinking")
  collection.fields.removeByName("aiModel")

  return app.save(collection)
})
