/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const tasks = app.findCollectionByNameOrId("tasks");

  tasks.fields.add(new Field({
    "hidden": false,
    "id": "editor_context",
    "maxSize": 500000,
    "name": "context",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "editor"
  }));

  return app.save(tasks);
}, (app) => {
  const tasks = app.findCollectionByNameOrId("tasks");

  tasks.fields.removeById("editor_context");

  return app.save(tasks);
});

