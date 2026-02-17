/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const tasks = app.findCollectionByNameOrId("pbc_2602490748")

  // Idempotent: some deployments patch schema at runtime (pb_bootstrap).
  const has = (name) => {
    try {
      return !!tasks.fields.getByName(name)
    } catch {
      return false
    }
  }

  if (!has("policy")) {
    tasks.fields.add(new Field({
      "hidden": false,
      "id": "json_tasks_policy",
      "maxSize": 2000000,
      "name": "policy",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "json"
    }))
  }

  if (!has("reviewChecklist")) {
    tasks.fields.add(new Field({
      "hidden": false,
      "id": "json_tasks_reviewChecklist",
      "maxSize": 2000000,
      "name": "reviewChecklist",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "json"
    }))
  }

  return app.save(tasks)
}, (app) => {
  const tasks = app.findCollectionByNameOrId("pbc_2602490748")

  tasks.fields.removeByName("policy")
  tasks.fields.removeByName("reviewChecklist")

  return app.save(tasks)
})

