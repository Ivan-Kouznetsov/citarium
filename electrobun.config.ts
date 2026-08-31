import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "Citarium",
		identifier: "ca.ivank.app.citarium",
		version: "0.1.0",
	},
	build: {
		mainProcess: "cottontail",
		cottontail: {
			entrypoint: "src/main.ts",
		},
		views: {
			mainview: {
				entrypoint: "src/ui/app.ts",
			},
		},
		copy: {
			"src/ui/index.html": "views/mainview/index.html",
			"src/ui/styles/theme.css": "views/mainview/styles/theme.css",
			"src/ui/styles/platforms/mac.css": "views/mainview/styles/platforms/mac.css",
			"src/ui/styles/platforms/windows.css": "views/mainview/styles/platforms/windows.css",
			"src/ui/styles/platforms/linux.css": "views/mainview/styles/platforms/linux.css",
			"examples/feline_behavior_annotated_bibliography.json": "examples/feline_behavior_annotated_bibliography.json",
		},
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
