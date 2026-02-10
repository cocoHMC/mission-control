/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const tasks = app.findCollectionByNameOrId("tasks");

    tasks.fields.add(
      new Field({
        autogeneratePattern: "",
        hidden: false,
        id: "text_aiModel",
        max: 0,
        min: 0,
        name: "aiModel",
        pattern: "",
        presentable: false,
        primaryKey: false,
        required: false,
        system: false,
        type: "text",
      }),
    );

    return app.save(tasks);
  },
  (app) => {
    const tasks = app.findCollectionByNameOrId("tasks");
    tasks.fields.removeById("text_aiModel");
    return app.save(tasks);
  },
);

