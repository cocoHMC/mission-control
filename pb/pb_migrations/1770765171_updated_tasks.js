/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2602490748")

  // add field
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

  // add field
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

  // add field
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

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2602490748")

  // remove field
  collection.fields.removeById("text715664714")

  // remove field
  collection.fields.removeById("select3458886328")

  // remove field
  collection.fields.removeById("text1327524989")

  return app.save(collection)
})
