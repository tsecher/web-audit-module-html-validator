import {AbstractPuppeteerJourneyModule} from 'web_audit/dist/journey/AbstractPuppeteerJourneyModule.js';
import {PuppeteerJourneyEvents} from 'web_audit/dist/journey/AbstractPuppeteerJourney.js';
import {ModuleEvents} from 'web_audit/dist/modules/ModuleInterface.js';
import schema from './html-validator.schema.json' with {type: 'json'};
import { execFile } from 'child_process';
import vnuJar from 'vnu-jar';

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
		return 'HTML Validator';
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

		// Install Metatags store.
		this.context.config.storage?.installSchema(this, this.context);

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
		journey.on(PuppeteerJourneyEvents.JOURNEY_END_CONTEXT, async (data) => {
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
				await this.analyseContext(contextName, urlWrapper);
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

		let result;
		try{
			result = await this.getW3CValidation(this.contextsData[contextName]);
		}
		catch(err){
			result = {}
			this.context?.config?.logger.error(err);
		}


		// Event Data.
		eventData.result = {
			url: urlWrapper.url.toString(),
			context: contextName,
			result: result,
		};

		// Parse results
		const summaryResult = {};
		const allowedTypes = this.getOptions().allowedTypes;
		result?.filter(item => allowedTypes.includes(item.type))
			.forEach(item => {
				// Store details.
				summaryResult.url = item.url = urlWrapper.url.toString();
				summaryResult.context = item.context = contextName;
				this.context?.config?.storage?.add(this, 'html_validator_details', this.context, item);

				// Add to summary.
				summaryResult[item.type] = summaryResult[item.type] + 1 || 1;
			})

		this.context?.eventBus.emit(HtmlValidatorModuleEvents.onResult, eventData);
		this.context?.eventBus.emit(ModuleEvents.onAnalyseSummary, {module: this, group_id:`html_validator` , url: urlWrapper, summary: summaryResult});
		this.context?.config?.storage?.add(this, 'html_validator', this.context, summaryResult);

		this.context?.eventBus.emit(ModuleEvents.afterAnalyse, eventData);
		this.context?.eventBus.emit(HtmlValidatorModuleEvents.afterAnalyse, eventData);
	}

	/**
	 * {@inheritdoc}
	 */
	getSchema() {
		return schema;
	}

	async getW3CValidation(html){
		return new Promise((resolve, reject) => {
			const proc = execFile(
				"java",
				["-jar", vnuJar, "--format", "json", "-"],
				(err, stdout, stderr) => {
					try {
						const result = JSON.parse(stderr);
						resolve(result.messages ?? []);
					} catch (e) {
						reject(new Error(`vnu parse error: ${stderr}`));
					}
				}
			);

			// Absorber l'erreur EPIPE sur stdin sans crasher le process
			proc.stdin.on("error", (err) => {
				if (err.code !== "EPIPE") reject(err);
			});

			proc.stdin.write(html, (err) => {
				if (err && err.code !== "EPIPE") reject(err);
				proc.stdin.end();
			});
		});
	}
}
