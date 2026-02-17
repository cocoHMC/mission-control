/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_9051200003")

  const has = (name) => {
    try {
      return !!collection.fields.getByName(name)
    } catch {
      return false
    }
  }

  if (!has("runningStartedAt")) {
    collection.fields.add(new Field({
      "hidden": false,
      "id": "date_workflow_schedules_runningStartedAt",
      "max": "",
      "min": "",
      "name": "runningStartedAt",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "date"
    }))
  }

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_9051200003")

  collection.fields.removeByName("runningStartedAt")

  return app.save(collection)
})

