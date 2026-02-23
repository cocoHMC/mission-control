/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2602490748")

  const has = (name) => {
    try {
      return !!collection.fields.getByName(name)
    } catch {
      return false
    }
  }

  if (!has("projectId")) {
    collection.fields.addAt(30, new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_task_projectId",
      "max": 0,
      "min": 0,
      "name": "projectId",
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

  collection.fields.removeByName("projectId")

  return app.save(collection)
})

