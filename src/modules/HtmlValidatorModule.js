import {AbstractPuppeteerJourneyModule} from 'web_audit/dist/journey/AbstractPuppeteerJourneyModule.js';
import {PuppeteerJourneyEvents} from 'web_audit/dist/journey/AbstractPuppeteerJourney.js';
import {ModuleEvents} from 'web_audit/dist/modules/ModuleInterface.js';
import validator from 'html-validator';

/**
 * html-validator Module events.
 */
export const HtmlValidatorModuleEvents = {
	createHtmlValidatorModule: 'html_validator_module__createHtmlValidatorModule',
	beforeAnalyse: 'html_validator_module__beforeAnalyse',
	onResult: 'html_validator_module__onResult',
	onResultDetail: 'html_validator_module__onResultDetail',
	afterAnalyse: 'html_validator_module__afterAnalyse',
};

/**
 * html-validator.
 */
export default class HtmlValidatorModule extends AbstractPuppeteerJourneyModule {
	get name() {
		return 'html-validator';
	}

	get id() {
		return `html_validator`;
	}

	defaultOptions = {
		allowedTypes: ['error', 'warning'],
	};
	contextsData = {};

	/**
	 * {@inheritdoc}
	 */
	async init(context) {
		this.context = context;
		// Install assets coverage store.
		this.context.config.storage?.installStore('html_validator', this.context, {
			url: 'Url',
			context: 'Context',
			error: 'Errors',
			warning: 'Warnings',
			info: 'Infos',
		});

		this.context.config.storage?.installStore('html_validator_details', this.context, {
			url: 'Url',
			context: 'Context',
			type: 'Type',
			message: 'Message',
			extract: 'Extract',
		});

		// Emit.
		this.context.eventBus.emit(HtmlValidatorModuleEvents.createHtmlValidatorModule, {module: this});
	}

	/**
	 * {@inheritdoc}
	 */
	initEvents(journey) {
		journey.on(PuppeteerJourneyEvents.JOURNEY_START, async (data) => {
			this.contextsData = {};
		});
		journey.on(PuppeteerJourneyEvents.JOURNEY_NEW_CONTEXT, async (data) => {
			this.contextsData[data.name] = await this.getContextData(data);
		});
	}

	/**
	 * Return context data
	 */
	async getContextData(data) {
		return await data.wrapper.page.content();
	}

	/**
	 * {@inheritdoc}
	 */
	async analyse(urlWrapper) {
		this.context?.eventBus.emit(ModuleEvents.startsComputing, {module: this});
		for (const contextName in this.contextsData) {
			if (contextName) {
				this.analyseContext(contextName, urlWrapper);
			}
		}
		this.context?.eventBus.emit(ModuleEvents.endsComputing, {module: this});
		return true;
	}


	/**
	 * Analyse a context.
	 *
	 * @param {string} contextName
	 * @param {UrlWrapper} urlWrapper
	 */
	async analyseContext(contextName, urlWrapper) {

		const eventData = {
			module: this,
			url: urlWrapper,
		};
		this.context?.eventBus.emit(HtmlValidatorModuleEvents.beforeAnalyse, eventData);
		this.context?.eventBus.emit(ModuleEvents.beforeAnalyse, eventData);

		const result = await validator({
			url: urlWrapper.url.toString(),
			data: this.contextsData[contextName],
		})

		// Event Data.
		eventData.result = {
			url: urlWrapper.url.toString(),
			context: contextName,
			result: result,
		};

		// Parse results
		const summaryResult = {};
		const allowedTypes = this.getOptions().allowedTypes;
		result.messages
			.filter(item => allowedTypes.includes(item.type))
			.forEach(item => {
				// Store details.
				summaryResult.url = item.url = urlWrapper.url.toString();
				summaryResult.context = item.context = contextName;
				this.context?.config?.storage?.add('html_validator_details', this.context, item);

				// Add to summary.
				summaryResult[item.type] = summaryResult[item.type] + 1 || 1;
			})

		this.context?.eventBus.emit(HtmlValidatorModuleEvents.onResult, eventData);
		this.context?.config?.logger.result(`html-validator`, summaryResult, urlWrapper.url.toString());
		this.context?.config?.storage?.add('html_validator', this.context, summaryResult);
		this.context?.eventBus.emit(ModuleEvents.afterAnalyse, eventData);
		this.context?.eventBus.emit(HtmlValidatorModuleEvents.afterAnalyse, eventData);
	}

}
