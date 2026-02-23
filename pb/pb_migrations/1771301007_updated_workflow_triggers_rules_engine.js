/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("workflow_triggers")

  const has = (name) => {
    try {
      return !!collection.fields.getByName(name)
    } catch {
      return false
    }
  }

  if (!has("projectId")) {
    collection.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_wft_project_id",
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

  if (!has("priority")) {
    collection.fields.add(new Field({
      "hidden": false,
      "id": "select_wft_priority",
      "maxSelect": 1,
      "name": "priority",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "select",
      "values": ["p0", "p1", "p2", "p3"]
    }))
  }

  if (!has("assigneeId")) {
    collection.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_wft_assignee_id",
      "max": 0,
      "min": 0,
      "name": "assigneeId",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
  }

  if (!has("dueWithinMinutes")) {
    collection.fields.add(new Field({
      "hidden": false,
      "id": "number_wft_due_within_minutes",
      "max": null,
      "min": null,
      "name": "dueWithinMinutes",
      "onlyInt": false,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }))
  }

  if (!has("actions")) {
    collection.fields.add(new Field({
      "hidden": false,
      "id": "json_wft_actions",
      "maxSize": 0,
      "name": "actions",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "json"
    }))
  }

  try {
    const eventField = collection.fields.getByName("event")
    if (eventField?.type === "select") {
      eventField.values = ["task_status_to", "task_created", "task_due_soon"]
    }
  } catch {
    // ignore
  }

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("workflow_triggers")

  try {
    const eventField = collection.fields.getByName("event")
    if (eventField?.type === "select") {
      eventField.values = ["task_status_to"]
    }
  } catch {
    // ignore
  }

  collection.fields.removeByName("projectId")
  collection.fields.removeByName("priority")
  collection.fields.removeByName("assigneeId")
  collection.fields.removeByName("dueWithinMinutes")
  collection.fields.removeByName("actions")

  return app.save(collection)
})

