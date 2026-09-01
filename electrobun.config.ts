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
			"src/ui/assets/icon.png": "views/mainview/assets/icon.png",
			"src/ui/assets/icon-16.png": "views/mainview/assets/icon-16.png",
			"src/ui/assets/icon-32.png": "views/mainview/assets/icon-32.png",
			"src/ui/assets/icon-48.png": "views/mainview/assets/icon-48.png",
			"src/ui/assets/icon-64.png": "views/mainview/assets/icon-64.png",
			"src/ui/assets/icon-128.png": "views/mainview/assets/icon-128.png",
			"src/ui/assets/icon-256.png": "views/mainview/assets/icon-256.png",
			"src/ui/assets/icon-512.png": "views/mainview/assets/icon-512.png",
			"src/ui/assets/favicon.ico": "views/mainview/assets/favicon.ico",
			"examples/feline_behavior_annotated_bibliography.json": "examples/feline_behavior_annotated_bibliography.json",
		},
		mac: {
			bundleCEF: false,
			icons: "assets/icon.iconset",
		},
		linux: {
			bundleCEF: false,
			icon: "assets/icon.png",
		},
		win: {
			bundleCEF: false,
			icon: "assets/icon.ico",
		},
	},
} satisfies ElectrobunConfig;
