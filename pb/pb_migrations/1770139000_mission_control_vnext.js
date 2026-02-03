/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const tasks = app.findCollectionByNameOrId("tasks");
  const messages = app.findCollectionByNameOrId("messages");
  const documents = app.findCollectionByNameOrId("documents");
  const activities = app.findCollectionByNameOrId("activities");

  // Tasks (vNext fields)
  tasks.fields.add(new Field({ "hidden": false, "id": "date_createdAt", "max": "", "min": "", "name": "createdAt", "presentable": false, "required": true, "system": false, "type": "date" }));
  tasks.fields.add(new Field({ "hidden": false, "id": "date_updatedAt", "max": "", "min": "", "name": "updatedAt", "presentable": false, "required": true, "system": false, "type": "date" }));
  tasks.fields.add(new Field({ "hidden": false, "id": "date_startAt", "max": "", "min": "", "name": "startAt", "presentable": false, "required": false, "system": false, "type": "date" }));
  tasks.fields.add(new Field({ "hidden": false, "id": "date_dueAt", "max": "", "min": "", "name": "dueAt", "presentable": false, "required": false, "system": false, "type": "date" }));
  tasks.fields.add(new Field({ "hidden": false, "id": "date_completedAt", "max": "", "min": "", "name": "completedAt", "presentable": false, "required": false, "system": false, "type": "date" }));
  tasks.fields.add(new Field({ "hidden": false, "id": "bool_requiresReview", "name": "requiresReview", "presentable": false, "required": false, "system": false, "type": "bool" }));
  tasks.fields.add(new Field({ "hidden": false, "id": "number_order", "max": null, "min": null, "name": "order", "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number" }));
  tasks.fields.add(new Field({ "hidden": false, "id": "number_subtasksTotal", "max": null, "min": null, "name": "subtasksTotal", "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number" }));
  tasks.fields.add(new Field({ "hidden": false, "id": "number_subtasksDone", "max": null, "min": null, "name": "subtasksDone", "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number" }));

  // Messages
  messages.fields.add(new Field({ "hidden": false, "id": "date_createdAt", "max": "", "min": "", "name": "createdAt", "presentable": false, "required": true, "system": false, "type": "date" }));
  messages.fields.add(new Field({ "hidden": false, "id": "date_updatedAt", "max": "", "min": "", "name": "updatedAt", "presentable": false, "required": true, "system": false, "type": "date" }));

  // Documents
  documents.fields.add(new Field({ "hidden": false, "id": "date_createdAt", "max": "", "min": "", "name": "createdAt", "presentable": false, "required": true, "system": false, "type": "date" }));
  documents.fields.add(new Field({ "hidden": false, "id": "date_updatedAt", "max": "", "min": "", "name": "updatedAt", "presentable": false, "required": true, "system": false, "type": "date" }));

  // Activities
  activities.fields.add(new Field({ "hidden": false, "id": "date_createdAt", "max": "", "min": "", "name": "createdAt", "presentable": false, "required": true, "system": false, "type": "date" }));

  // Subtasks collection
  const subtasks = new Collection({
    "createRule": null,
    "deleteRule": null,
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_taskId",
        "max": 0,
        "min": 0,
        "name": "taskId",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_title",
        "max": 0,
        "min": 0,
        "name": "title",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "bool_done",
        "name": "done",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "bool"
      },
      {
        "hidden": false,
        "id": "number_order",
        "max": null,
        "min": null,
        "name": "order",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "json_assigneeIds",
        "maxSize": 2000000,
        "name": "assigneeIds",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "date_dueAt",
        "max": "",
        "min": "",
        "name": "dueAt",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "date"
      },
      {
        "hidden": false,
        "id": "date_createdAt",
        "max": "",
        "min": "",
        "name": "createdAt",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "date"
      },
      {
        "hidden": false,
        "id": "date_updatedAt",
        "max": "",
        "min": "",
        "name": "updatedAt",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "date"
      }
    ],
    "id": "pbc_2456808181",
    "indexes": [
      "CREATE INDEX `idx_taskId_pbc_2456808181` ON `subtasks` (`taskId`)",
      "CREATE INDEX `idx_taskId_order_pbc_2456808181` ON `subtasks` (`taskId`, `order`)"
    ],
    "listRule": null,
    "name": "subtasks",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": null
  });

  app.save(tasks);
  app.save(messages);
  app.save(documents);
  app.save(activities);
  return app.save(subtasks);
}, (app) => {
  const tasks = app.findCollectionByNameOrId("tasks");
  const messages = app.findCollectionByNameOrId("messages");
  const documents = app.findCollectionByNameOrId("documents");
  const activities = app.findCollectionByNameOrId("activities");

  tasks.fields.removeById("date_createdAt");
  tasks.fields.removeById("date_updatedAt");
  tasks.fields.removeById("date_startAt");
  tasks.fields.removeById("date_dueAt");
  tasks.fields.removeById("date_completedAt");
  tasks.fields.removeById("bool_requiresReview");
  tasks.fields.removeById("number_order");
  tasks.fields.removeById("number_subtasksTotal");
  tasks.fields.removeById("number_subtasksDone");

  messages.fields.removeById("date_createdAt");
  messages.fields.removeById("date_updatedAt");

  documents.fields.removeById("date_createdAt");
  documents.fields.removeById("date_updatedAt");

  activities.fields.removeById("date_createdAt");

  app.save(tasks);
  app.save(messages);
  app.save(documents);
  app.save(activities);

  const subtasks = app.findCollectionByNameOrId("pbc_2456808181");
  return app.delete(subtasks);
});
