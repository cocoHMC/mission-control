/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const tasks = app.findCollectionByNameOrId("tasks");

  tasks.fields.add(
    new Field({
      "hidden": false,
      "id": "select_aiEffort",
      "maxSelect": 1,
      "name": "aiEffort",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "select",
      "values": ["auto", "efficient", "balanced", "heavy"]
    })
  );

  tasks.fields.add(
    new Field({
      "hidden": false,
      "id": "select_aiModelTier",
      "maxSelect": 1,
      "name": "aiModelTier",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "select",
      "values": ["auto", "cheap", "balanced", "heavy", "vision", "code"]
    })
  );

  return app.save(tasks);
}, (app) => {
  const tasks = app.findCollectionByNameOrId("tasks");

  tasks.fields.removeById("select_aiEffort");
  tasks.fields.removeById("select_aiModelTier");

  return app.save(tasks);
});

