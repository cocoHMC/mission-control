/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3598433047")

  collection.fields.add(new Field({
    "hidden": false,
    "id": "text_node_id",
    "max": 0,
    "min": 0,
    "name": "nodeId",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3598433047")

  collection.fields.removeById("text_node_id")

  return app.save(collection)
})
