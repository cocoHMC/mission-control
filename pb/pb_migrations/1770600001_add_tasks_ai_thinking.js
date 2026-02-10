/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const tasks = app.findCollectionByNameOrId("tasks");

    tasks.fields.add(
      new Field({
        hidden: false,
        id: "select_aiThinking",
        maxSelect: 1,
        name: "aiThinking",
        presentable: false,
        required: false,
        system: false,
        type: "select",
        values: ["auto", "low", "medium", "high", "xhigh"],
      }),
    );

    return app.save(tasks);
  },
  (app) => {
    const tasks = app.findCollectionByNameOrId("tasks");
    tasks.fields.removeById("select_aiThinking");
    return app.save(tasks);
  },
);

