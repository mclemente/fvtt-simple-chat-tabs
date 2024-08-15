import { libWrapper } from "./libWrapper.js";

Hooks.on("init", () => {
	class TabChatLog extends CONFIG.ui.chat {
		constructor(options) {
			super(options);
			const { OTHER, OOC, IC, EMOTE } = CONST.CHAT_MESSAGE_STYLES;
			const icSources = [IC, EMOTE];
			const oocSources = [OOC];
			if (game.settings.get("simple-chat-tabs", "otherTypeTab")) oocSources.push(OTHER);
			else icSources.push(OTHER);
			this.tabs = [
				{
					id: "ic",
					name: game.settings.get("simple-chat-tabs", "icName"),
					sources: icSources,
				},
				{
					id: "ooc",
					name: game.settings.get("simple-chat-tabs", "oocName"),
					sources: oocSources,
				},
			];
		}

		/** @override */
		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				template: "modules/simple-chat-tabs/templates/chat-log.html",
				tabs: [{ navSelector: ".tabs", contentSelector: ".content", initial: "ic" }],
			});
		}

		get tab() {
			const activeId = this._tabs[0].active;
			return this.tabs.find((i) => i.id === activeId);
		}

		async _onChangeTab(event, tabs, active) {
			game.messages.contents
				.reverse()
				.filter((m) => m.logged && !m.visible)
				.forEach((m) => {
					m.logged = false;
					let li = this.element.find(`.message[data-message-id="${m.id}"]`);
					if (li.length) li.remove();
				});
			game.messages.contents
				.slice(-CONFIG.ChatMessage.batchSize)
				.reverse()
				.filter((m) => !m.logged)
				.forEach(async (m) => await this.updateMessage(m));
			this.setPosition();
		}

		/* -------------------------------------------- */
		/*  Application Rendering                       */
		/* -------------------------------------------- */

		/** @override */
		async getData(options = {}) {
			const context = await super.getData(options);
			return foundry.utils.mergeObject(context, {
				chatTabs: this.tabs,
			});
		}

		/** @override */
		notify(message, tab) {
			this._lastMessageTime = Date.now();
			if (!this.rendered) return;
			tab ??= this.tab;

			// Display the chat notification icon and remove it 3 seconds later
			let icon = $("#chat-notification");
			let tabIcon = $(`#${tab.id}chat-notification`);
			if (icon.is(":hidden")) icon.fadeIn(100);
			if (tabIcon.is(":hidden")) tabIcon.fadeIn(100);
			setTimeout(() => {
				if (Date.now() - this._lastMessageTime > 3000) {
					if (icon.is(":visible")) icon.fadeOut(100);
					if (tabIcon.is(":visible")) tabIcon.fadeOut(100);
				}
			}, 3001);

			// Play a notification sound effect
			if (message.sound) game.audio.play(message.sound, { context: game.audio.interface });
		}

		/** @override */
		async postOne(message, { before, notify = false } = {}) {
			if (!message.visible) {
				if (notify) {
					const tab = this.tabs.find((t) => t.id !== this.tab.id);
					if (tab.sources.includes(message.style) && this._isMessageVisible(message)) {
						this.notify(message, tab);
						return;
					}
				}
				return;
			}
			await super.postOne(message, { before, notify });
		}

		/**
		 * Poor man's ChatMessage#visible getter
		 * @param {ChatMessage} message
		 * @returns {boolean}
		 */
		_isMessageVisible(message) {
			if (message.whisper.length) {
				if (message.isRoll) return true;
				return message.isAuthor || message.whisper.indexOf(game.user.id) !== -1;
			}
			return true;
		}
	}

	class TabMessages extends Messages {
		/** @override */
		async flush() {
			return Dialog.confirm({
				title: game.i18n.localize("CHAT.FlushTitle"),
				content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("CHAT.FlushWarning")}</p>`,
				yes: () => {
					this.documentClass.deleteDocuments(
						[...this]
							.filter((message) => ui.chat.tab.sources.includes(message.style))
							.map((message) => message.id)
					);
					const jumpToBottomElement = document.querySelector(".jump-to-bottom");
					jumpToBottomElement.classList.add("hidden");
				},
				options: {
					top: window.innerHeight - 150,
					left: window.innerWidth - 720,
				},
			});
		}
	}
	CONFIG.ui.chat = TabChatLog;
	libWrapper.register("simple-chat-tabs", "Messages.prototype.flush", TabMessages.prototype.flush, "OVERRIDE");
	libWrapper.register(
		"simple-chat-tabs",
		"CONFIG.ChatMessage.documentClass.prototype.visible",
		function () {
			const visible = ui.chat.tab.sources.includes(this.style);
			if (visible && this.whisper.length) {
				if (this.isRoll) return true;
				return this.isAuthor || this.whisper.indexOf(game.user.id) !== -1;
			}
			return visible;
		},
		"OVERRIDE"
	);
});

Hooks.on("i18nInit", () => {
	game.settings.register("simple-chat-tabs", "icName", {
		name: game.i18n.localize("TC.SETTINGS.icName.name"),
		hint: game.i18n.localize("TC.SETTINGS.icName.hint"),
		scope: "world",
		config: true,
		default: game.i18n.localize("TC.TABS.IC"),
		type: String,
		requiresReload: true,
	});

	game.settings.register("simple-chat-tabs", "oocName", {
		name: game.i18n.localize("TC.SETTINGS.oocName.name"),
		hint: game.i18n.localize("TC.SETTINGS.oocName.hint"),
		scope: "world",
		config: true,
		default: game.i18n.localize("TC.TABS.OOC"),
		type: String,
		requiresReload: true,
	});

	game.settings.register("simple-chat-tabs", "otherTypeTab", {
		name: game.i18n.localize("TC.SETTINGS.otherTypeTab.name"),
		hint: game.i18n.localize("TC.SETTINGS.otherTypeTab.hint"),
		scope: "world",
		config: true,
		default: false,
		type: Boolean,
		onChange: (value) => {
			const { OTHER } = CONST.CHAT_MESSAGE_STYLES;
			if (value) {
				ui.chat.tabs[0].sources = ui.chat.tabs[0].sources.filter((s) => s !== OTHER);
				ui.chat.tabs[1].sources.push(OTHER);
			} else {
				ui.chat.tabs[1].sources = ui.chat.tabs[1].sources.filter((s) => s !== OTHER);
				ui.chat.tabs[0].sources.push(OTHER);
			}
			ui.chat._onChangeTab();
		},
	});

	game.settings.register("simple-chat-tabs", "enforceOoc", {
		name: game.i18n.localize("TC.SETTINGS.enforceOoc.name"),
		hint: game.i18n.localize("TC.SETTINGS.enforceOoc.hint"),
		scope: "world",
		config: true,
		default: false,
		type: Boolean
	});
});

Hooks.on("preCreateChatMessage", (chatMessage, content, options, userId) => {
	const { OOC, IC } = CONST.CHAT_MESSAGE_STYLES;
	if (
		game.settings.get("simple-chat-tabs", "enforceOoc")
		&& chatMessage.style === IC
		&& ui.chat.tab?.id === "ooc"
	) {
		chatMessage._source.style = OOC;
		chatMessage.style = OOC;
		content.style = OOC;
		delete content.speaker;
		const speaker = {
			actor: null,
			alias: undefined,
			scene: null,
			token: null,
		};
		chatMessage.speaker = speaker;
		chatMessage._source.speaker = speaker;
	}
});
