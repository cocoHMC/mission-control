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

  if (!has("recurrence")) {
    collection.fields.add(new Field({
      "hidden": false,
      "id": "json_tasks_recurrence",
      "maxSize": 2000000,
      "name": "recurrence",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "json"
    }))
  }

  if (!has("recurrenceSeriesId")) {
    collection.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_tasks_recurrenceSeriesId",
      "max": 0,
      "min": 0,
      "name": "recurrenceSeriesId",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
  }

  if (!has("recurrenceFromTaskId")) {
    collection.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_tasks_recurrenceFromTaskId",
      "max": 0,
      "min": 0,
      "name": "recurrenceFromTaskId",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
  }

  if (!has("recurrenceSpawnedTaskId")) {
    collection.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_tasks_recurrenceSpawnedTaskId",
      "max": 0,
      "min": 0,
      "name": "recurrenceSpawnedTaskId",
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

  collection.fields.removeByName("recurrence")
  collection.fields.removeByName("recurrenceSeriesId")
  collection.fields.removeByName("recurrenceFromTaskId")
  collection.fields.removeByName("recurrenceSpawnedTaskId")

  return app.save(collection)
})
