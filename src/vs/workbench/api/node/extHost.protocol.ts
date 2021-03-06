/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	createMainContextProxyIdentifier as createMainId,
	createExtHostContextProxyIdentifier as createExtId,
	ProxyIdentifier, IThreadService
} from 'vs/workbench/services/thread/common/threadService';

import * as vscode from 'vscode';

import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';

import { IMarkerData } from 'vs/platform/markers/common/markers';
import { Position as EditorPosition } from 'vs/platform/editor/common/editor';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { StatusbarAlignment as MainThreadStatusBarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { ITelemetryInfo } from 'vs/platform/telemetry/common/telemetry';
import { ICommandHandlerDescription } from 'vs/platform/commands/common/commands';
import { IWorkspace } from 'vs/platform/workspace/common/workspace';

import * as editorCommon from 'vs/editor/common/editorCommon';
import * as modes from 'vs/editor/common/modes';
import { IResourceEdit } from 'vs/editor/common/services/bulkEdit';

import { ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IWorkspaceConfigurationValues } from 'vs/workbench/services/configuration/common/configuration';

import { IPickOpenEntry, IPickOptions } from 'vs/platform/quickOpen/common/quickOpen';
import { SaveReason } from 'vs/workbench/services/textfile/common/textfiles';
import { IWorkspaceSymbol } from 'vs/workbench/parts/search/common/search';
import { IApplyEditsOptions, IUndoStopOptions, TextEditorRevealType, ITextEditorConfigurationUpdate, IResolvedTextEditorConfiguration, ISelectionChangeEvent } from './mainThreadEditorsTracker';

import { InternalTreeExplorerNodeContent } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';

export interface IEnvironment {
	enableProposedApi: boolean;
	appSettingsHome: string;
	disableExtensions: boolean;
	userExtensionsHome: string;
	extensionDevelopmentPath: string;
	extensionTestsPath: string;
}

export interface IInitData {
	parentPid: number;
	environment: IEnvironment;
	contextService: {
		workspace: IWorkspace;
	};
	extensions: IExtensionDescription[];
	configuration: IWorkspaceConfigurationValues;
	telemetryInfo: ITelemetryInfo;
}

export interface InstanceSetter<T> {
	set<R extends T>(instance: T): R;
}

export class InstanceCollection {
	private _items: { [id: string]: any; };

	constructor() {
		this._items = Object.create(null);
	}

	public define<T>(id: ProxyIdentifier<T>): InstanceSetter<T> {
		let that = this;
		return new class {
			set(value: T) {
				that._set(id, value);
				return value;
			}
		};
	}

	_set<T>(id: ProxyIdentifier<T>, value: T): void {
		this._items[id.id] = value;
	}

	public finish(isMain: boolean, threadService: IThreadService): void {
		let expected = (isMain ? MainContext : ExtHostContext);
		Object.keys(expected).forEach((key) => {
			let id = expected[key];
			let value = this._items[id.id];

			if (!value) {
				throw new Error(`Missing actor ${key} (isMain: ${id.isMain}, id:  ${id.id})`);
			}
			threadService.set<any>(id, value);
		});
	}
}

function ni() { return new Error('Not implemented'); }

// --- main thread

export abstract class MainThreadCommandsShape {
	$registerCommand(id: string): TPromise<any> { throw ni(); }
	$unregisterCommand(id: string): TPromise<any> { throw ni(); }
	$executeCommand<T>(id: string, args: any[]): Thenable<T> { throw ni(); }
	$getCommands(): Thenable<string[]> { throw ni(); }
}

export abstract class MainThreadConfigurationShape {
	$updateConfigurationOption(target: ConfigurationTarget, key: string, value: any): TPromise<void> { throw ni(); }
	$removeConfigurationOption(target: ConfigurationTarget, key: string): TPromise<void> { throw ni(); }
}

export abstract class MainThreadDiagnosticsShape {
	$changeMany(owner: string, entries: [URI, IMarkerData[]][]): TPromise<any> { throw ni(); }
	$clear(owner: string): TPromise<any> { throw ni(); }
}

export abstract class MainThreadDocumentsShape {
	$tryCreateDocument(options?: { language: string; }): TPromise<any> { throw ni(); }
	$tryOpenDocument(uri: URI): TPromise<any> { throw ni(); }
	$registerTextContentProvider(handle: number, scheme: string): void { throw ni(); }
	$onVirtualDocumentChange(uri: URI, value: editorCommon.IRawText): void { throw ni(); }
	$unregisterTextContentProvider(handle: number): void { throw ni(); }
	$trySaveDocument(uri: URI): TPromise<boolean> { throw ni(); }
}

export abstract class MainThreadEditorsShape {
	$tryShowTextDocument(resource: URI, position: EditorPosition, preserveFocus: boolean): TPromise<string> { throw ni(); }
	$registerTextEditorDecorationType(key: string, options: editorCommon.IDecorationRenderOptions): void { throw ni(); }
	$removeTextEditorDecorationType(key: string): void { throw ni(); }
	$tryShowEditor(id: string, position: EditorPosition): TPromise<void> { throw ni(); }
	$tryHideEditor(id: string): TPromise<void> { throw ni(); }
	$trySetOptions(id: string, options: ITextEditorConfigurationUpdate): TPromise<any> { throw ni(); }
	$trySetDecorations(id: string, key: string, ranges: editorCommon.IDecorationOptions[]): TPromise<any> { throw ni(); }
	$tryRevealRange(id: string, range: editorCommon.IRange, revealType: TextEditorRevealType): TPromise<any> { throw ni(); }
	$trySetSelections(id: string, selections: editorCommon.ISelection[]): TPromise<any> { throw ni(); }
	$tryApplyEdits(id: string, modelVersionId: number, edits: editorCommon.ISingleEditOperation[], opts: IApplyEditsOptions): TPromise<boolean> { throw ni(); }
	$tryInsertSnippet(id: string, template: string, opts: IUndoStopOptions): TPromise<any> { throw ni(); }
}

export abstract class MainThreadTreeExplorersShape {
	$registerTreeExplorerNodeProvider(providerId: string): void { throw ni(); }
}

export abstract class MainThreadErrorsShape {
	onUnexpectedExtHostError(err: any): void { throw ni(); }
}

export abstract class MainThreadLanguageFeaturesShape {
	$unregister(handle: number): TPromise<any> { throw ni(); }
	$registerOutlineSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerCodeLensSupport(handle: number, selector: vscode.DocumentSelector, eventHandle: number): TPromise<any> { throw ni(); }
	$emitCodeLensEvent(eventHandle: number, event?: any): TPromise<any> { throw ni(); }
	$registerDeclaractionSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerImplementationSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerHoverProvider(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerDocumentHighlightProvider(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerReferenceSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerQuickFixSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerDocumentFormattingSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerRangeFormattingSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerOnTypeFormattingSupport(handle: number, selector: vscode.DocumentSelector, autoFormatTriggerCharacters: string[]): TPromise<any> { throw ni(); }
	$registerNavigateTypeSupport(handle: number): TPromise<any> { throw ni(); }
	$registerRenameSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerSuggestSupport(handle: number, selector: vscode.DocumentSelector, triggerCharacters: string[]): TPromise<any> { throw ni(); }
	$registerSignatureHelpProvider(handle: number, selector: vscode.DocumentSelector, triggerCharacter: string[]): TPromise<any> { throw ni(); }
	$registerDocumentLinkProvider(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$setLanguageConfiguration(handle: number, languageId: string, configuration: vscode.LanguageConfiguration): TPromise<any> { throw ni(); }
}

export abstract class MainThreadLanguagesShape {
	$getLanguages(): TPromise<string[]> { throw ni(); }
}

export abstract class MainThreadMessageServiceShape {
	$showMessage(severity: Severity, message: string, commands: { title: string; isCloseAffordance: boolean; handle: number; }[]): Thenable<number> { throw ni(); }
}

export abstract class MainThreadOutputServiceShape {
	$append(channelId: string, label: string, value: string): TPromise<void> { throw ni(); }
	$clear(channelId: string, label: string): TPromise<void> { throw ni(); }
	$reveal(channelId: string, label: string, preserveFocus: boolean): TPromise<void> { throw ni(); }
	$close(channelId: string): TPromise<void> { throw ni(); }
}

export abstract class MainThreadProgressShape {

	$startWindow(handle: number, title: string): void { throw ni(); };
	$startScm(handle: number): void { throw ni(); };
	$progressReport(handle: number, message: string): void { throw ni(); }
	$progressEnd(handle: number): void { throw ni(); }
}

export abstract class MainThreadTerminalServiceShape {
	$createTerminal(name?: string, shellPath?: string, shellArgs?: string[], waitOnExit?: boolean): TPromise<number> { throw ni(); }
	$dispose(terminalId: number): void { throw ni(); }
	$hide(terminalId: number): void { throw ni(); }
	$sendText(terminalId: number, text: string, addNewLine: boolean): void { throw ni(); }
	$show(terminalId: number, preserveFocus: boolean): void { throw ni(); }
}

export interface MyQuickPickItems extends IPickOpenEntry {
	handle: number;
}
export abstract class MainThreadQuickOpenShape {
	$show(options: IPickOptions): Thenable<number> { throw ni(); }
	$setItems(items: MyQuickPickItems[]): Thenable<any> { throw ni(); }
	$setError(error: Error): Thenable<any> { throw ni(); }
	$input(options: vscode.InputBoxOptions, validateInput: boolean): TPromise<string> { throw ni(); }
}

export abstract class MainThreadStatusBarShape {
	$setEntry(id: number, extensionId: string, text: string, tooltip: string, command: string, color: string, alignment: MainThreadStatusBarAlignment, priority: number): void { throw ni(); }
	$dispose(id: number) { throw ni(); }
}

export abstract class MainThreadStorageShape {
	$getValue<T>(shared: boolean, key: string): TPromise<T> { throw ni(); }
	$setValue(shared: boolean, key: string, value: any): TPromise<any> { throw ni(); }
}

export abstract class MainThreadTelemetryShape {
	$publicLog(eventName: string, data?: any): void { throw ni(); }
	$getTelemetryInfo(): TPromise<ITelemetryInfo> { throw ni(); }
}

export abstract class MainThreadWorkspaceShape {
	$startSearch(include: string, exclude: string, maxResults: number, requestId: number): Thenable<URI[]> { throw ni(); }
	$cancelSearch(requestId: number): Thenable<boolean> { throw ni(); }
	$saveAll(includeUntitled?: boolean): Thenable<boolean> { throw ni(); }
	$applyWorkspaceEdit(edits: IResourceEdit[]): TPromise<boolean> { throw ni(); }
}

export abstract class MainProcessExtensionServiceShape {
	$localShowMessage(severity: Severity, msg: string): void { throw ni(); }
	$onExtensionActivated(extensionId: string): void { throw ni(); }
	$onExtensionActivationFailed(extensionId: string): void { throw ni(); }
}

export interface SCMProviderFeatures {
	label: string;
	supportsCommit: boolean;
	supportsOpen: boolean;
	supportsDrag: boolean;
	supportsOriginalResource: boolean;
}

export type SCMRawResource = [
	string /*uri*/,
	string[] /*icons: light, dark*/,
	boolean /*strike through*/
];
export type SCMRawResourceGroup = [string /*id*/, string /*label*/, SCMRawResource[]];

export abstract class MainThreadSCMShape {
	$register(id: string, features: SCMProviderFeatures): void { throw ni(); }
	$unregister(id: string): void { throw ni(); }
	$onChange(id: string, resources: SCMRawResourceGroup[]): void { throw ni(); }
}

// -- extension host

export abstract class ExtHostCommandsShape {
	$executeContributedCommand<T>(id: string, ...args: any[]): Thenable<T> { throw ni(); }
	$getContributedCommandHandlerDescriptions(): TPromise<{ [id: string]: string | ICommandHandlerDescription }> { throw ni(); }
}

export abstract class ExtHostConfigurationShape {
	$acceptConfigurationChanged(values: IWorkspaceConfigurationValues) { throw ni(); }
}

export abstract class ExtHostDiagnosticsShape {

}

export interface IModelAddedData {
	url: URI;
	versionId: number;
	value: editorCommon.IRawText;
	modeId: string;
	isDirty: boolean;
}
export abstract class ExtHostDocumentsShape {
	$provideTextDocumentContent(handle: number, uri: URI): TPromise<string> { throw ni(); }
	$acceptModelAdd(initData: IModelAddedData): void { throw ni(); }
	$acceptModelModeChanged(strURL: string, oldModeId: string, newModeId: string): void { throw ni(); }
	$acceptModelSaved(strURL: string): void { throw ni(); }
	$acceptModelDirty(strURL: string): void { throw ni(); }
	$acceptModelReverted(strURL: string): void { throw ni(); }
	$acceptModelRemoved(strURL: string): void { throw ni(); }
	$acceptModelChanged(strURL: string, events: editorCommon.IModelContentChangedEvent2[], isDirty: boolean): void { throw ni(); }
}

export abstract class ExtHostDocumentSaveParticipantShape {
	$participateInSave(resource: URI, reason: SaveReason): TPromise<boolean[]> { throw ni(); }
}

export interface ITextEditorAddData {
	id: string;
	document: URI;
	options: IResolvedTextEditorConfiguration;
	selections: editorCommon.ISelection[];
	editorPosition: EditorPosition;
}
export interface ITextEditorPositionData {
	[id: string]: EditorPosition;
}
export abstract class ExtHostEditorsShape {
	$acceptTextEditorAdd(data: ITextEditorAddData): void { throw ni(); }
	$acceptOptionsChanged(id: string, opts: IResolvedTextEditorConfiguration): void { throw ni(); }
	$acceptSelectionsChanged(id: string, event: ISelectionChangeEvent): void { throw ni(); }
	$acceptActiveEditorAndVisibleEditors(id: string, visibleIds: string[]): void { throw ni(); }
	$acceptEditorPositionData(data: ITextEditorPositionData): void { throw ni(); }
	$acceptTextEditorRemove(id: string): void { throw ni(); }
}

export abstract class ExtHostTreeExplorersShape {
	$provideRootNode(providerId: string): TPromise<InternalTreeExplorerNodeContent> { throw ni(); };
	$resolveChildren(providerId: string, node: InternalTreeExplorerNodeContent): TPromise<InternalTreeExplorerNodeContent[]> { throw ni(); }
	$getInternalCommand(providerId: string, node: InternalTreeExplorerNodeContent): TPromise<modes.Command> { throw ni(); }
}

export abstract class ExtHostExtensionServiceShape {
	$localShowMessage(severity: Severity, msg: string): void { throw ni(); }
	$activateExtension(extensionDescription: IExtensionDescription): TPromise<void> { throw ni(); }
}

export interface FileSystemEvents {
	created: URI[];
	changed: URI[];
	deleted: URI[];
}
export abstract class ExtHostFileSystemEventServiceShape {
	$onFileEvent(events: FileSystemEvents) { throw ni(); }
}

export interface ObjectIdentifier {
	$ident: number;
}

export namespace ObjectIdentifier {
	export const name = '$ident';
	export function mixin<T>(obj: T, id: number): T & ObjectIdentifier {
		Object.defineProperty(obj, name, { value: id, enumerable: true });
		return <T & ObjectIdentifier>obj;
	}
	export function of(obj: any): number {
		return obj[name];
	}
}

export abstract class ExtHostHeapServiceShape {
	$onGarbageCollection(ids: number[]): void { throw ni(); }
}

export abstract class ExtHostLanguageFeaturesShape {
	$provideDocumentSymbols(handle: number, resource: URI): TPromise<modes.SymbolInformation[]> { throw ni(); }
	$provideCodeLenses(handle: number, resource: URI): TPromise<modes.ICodeLensSymbol[]> { throw ni(); }
	$resolveCodeLens(handle: number, resource: URI, symbol: modes.ICodeLensSymbol): TPromise<modes.ICodeLensSymbol> { throw ni(); }
	$provideDefinition(handle: number, resource: URI, position: editorCommon.IPosition): TPromise<modes.Definition> { throw ni(); }
	$provideImplementation(handle: number, resource: URI, position: editorCommon.IPosition): TPromise<modes.Definition> { throw ni(); }
	$provideHover(handle: number, resource: URI, position: editorCommon.IPosition): TPromise<modes.Hover> { throw ni(); }
	$provideDocumentHighlights(handle: number, resource: URI, position: editorCommon.IPosition): TPromise<modes.DocumentHighlight[]> { throw ni(); }
	$provideReferences(handle: number, resource: URI, position: editorCommon.IPosition, context: modes.ReferenceContext): TPromise<modes.Location[]> { throw ni(); }
	$provideCodeActions(handle: number, resource: URI, range: editorCommon.IRange): TPromise<modes.CodeAction[]> { throw ni(); }
	$provideDocumentFormattingEdits(handle: number, resource: URI, options: modes.FormattingOptions): TPromise<editorCommon.ISingleEditOperation[]> { throw ni(); }
	$provideDocumentRangeFormattingEdits(handle: number, resource: URI, range: editorCommon.IRange, options: modes.FormattingOptions): TPromise<editorCommon.ISingleEditOperation[]> { throw ni(); }
	$provideOnTypeFormattingEdits(handle: number, resource: URI, position: editorCommon.IPosition, ch: string, options: modes.FormattingOptions): TPromise<editorCommon.ISingleEditOperation[]> { throw ni(); }
	$provideWorkspaceSymbols(handle: number, search: string): TPromise<IWorkspaceSymbol[]> { throw ni(); }
	$resolveWorkspaceSymbol(handle: number, symbol: IWorkspaceSymbol): TPromise<IWorkspaceSymbol> { throw ni(); }
	$provideRenameEdits(handle: number, resource: URI, position: editorCommon.IPosition, newName: string): TPromise<modes.WorkspaceEdit> { throw ni(); }
	$provideCompletionItems(handle: number, resource: URI, position: editorCommon.IPosition): TPromise<modes.ISuggestResult> { throw ni(); }
	$resolveCompletionItem(handle: number, resource: URI, position: editorCommon.IPosition, suggestion: modes.ISuggestion): TPromise<modes.ISuggestion> { throw ni(); }
	$provideSignatureHelp(handle: number, resource: URI, position: editorCommon.IPosition): TPromise<modes.SignatureHelp> { throw ni(); }
	$provideDocumentLinks(handle: number, resource: URI): TPromise<modes.ILink[]> { throw ni(); }
	$resolveDocumentLink(handle: number, link: modes.ILink): TPromise<modes.ILink> { throw ni(); }
}

export abstract class ExtHostQuickOpenShape {
	$onItemSelected(handle: number): void { throw ni(); }
	$validateInput(input: string): TPromise<string> { throw ni(); }
}

export abstract class ExtHostTerminalServiceShape {
	$acceptTerminalClosed(id: number): void { throw ni(); }
	$acceptTerminalProcessId(id: number, processId: number): void { throw ni(); }
}

export abstract class ExtHostSCMShape {
	$commit(id: string, message: string): TPromise<void> { throw ni(); }
	$open(id: string, resourceGroupId: string, uri: string): TPromise<void> { throw ni(); }
	$drag(id: string, fromResourceGroupId: string, fromUri: string, toResourceGroupId: string): TPromise<void> { throw ni(); }
	$getOriginalResource(id: string, uri: URI): TPromise<URI> { throw ni(); }
}

// --- proxy identifiers

export const MainContext = {
	MainThreadCommands: createMainId<MainThreadCommandsShape>('MainThreadCommands', MainThreadCommandsShape),
	MainThreadConfiguration: createMainId<MainThreadConfigurationShape>('MainThreadConfiguration', MainThreadConfigurationShape),
	MainThreadDiagnostics: createMainId<MainThreadDiagnosticsShape>('MainThreadDiagnostics', MainThreadDiagnosticsShape),
	MainThreadDocuments: createMainId<MainThreadDocumentsShape>('MainThreadDocuments', MainThreadDocumentsShape),
	MainThreadEditors: createMainId<MainThreadEditorsShape>('MainThreadEditors', MainThreadEditorsShape),
	MainThreadErrors: createMainId<MainThreadErrorsShape>('MainThreadErrors', MainThreadErrorsShape),
	MainThreadExplorers: createMainId<MainThreadTreeExplorersShape>('MainThreadExplorers', MainThreadTreeExplorersShape),
	MainThreadLanguageFeatures: createMainId<MainThreadLanguageFeaturesShape>('MainThreadLanguageFeatures', MainThreadLanguageFeaturesShape),
	MainThreadLanguages: createMainId<MainThreadLanguagesShape>('MainThreadLanguages', MainThreadLanguagesShape),
	MainThreadMessageService: createMainId<MainThreadMessageServiceShape>('MainThreadMessageService', MainThreadMessageServiceShape),
	MainThreadOutputService: createMainId<MainThreadOutputServiceShape>('MainThreadOutputService', MainThreadOutputServiceShape),
	MainThreadProgress: createMainId<MainThreadProgressShape>('MainThreadProgress', MainThreadProgressShape),
	MainThreadQuickOpen: createMainId<MainThreadQuickOpenShape>('MainThreadQuickOpen', MainThreadQuickOpenShape),
	MainThreadStatusBar: createMainId<MainThreadStatusBarShape>('MainThreadStatusBar', MainThreadStatusBarShape),
	MainThreadStorage: createMainId<MainThreadStorageShape>('MainThreadStorage', MainThreadStorageShape),
	MainThreadTelemetry: createMainId<MainThreadTelemetryShape>('MainThreadTelemetry', MainThreadTelemetryShape),
	MainThreadTerminalService: createMainId<MainThreadTerminalServiceShape>('MainThreadTerminalService', MainThreadTerminalServiceShape),
	MainThreadWorkspace: createMainId<MainThreadWorkspaceShape>('MainThreadWorkspace', MainThreadWorkspaceShape),
	MainProcessExtensionService: createMainId<MainProcessExtensionServiceShape>('MainProcessExtensionService', MainProcessExtensionServiceShape),
	MainThreadSCM: createMainId<MainThreadSCMShape>('MainThreadSCM', MainThreadSCMShape)
};

export const ExtHostContext = {
	ExtHostCommands: createExtId<ExtHostCommandsShape>('ExtHostCommands', ExtHostCommandsShape),
	ExtHostConfiguration: createExtId<ExtHostConfigurationShape>('ExtHostConfiguration', ExtHostConfigurationShape),
	ExtHostDiagnostics: createExtId<ExtHostDiagnosticsShape>('ExtHostDiagnostics', ExtHostDiagnosticsShape),
	ExtHostDocuments: createExtId<ExtHostDocumentsShape>('ExtHostDocuments', ExtHostDocumentsShape),
	ExtHostDocumentSaveParticipant: createExtId<ExtHostDocumentSaveParticipantShape>('ExtHostDocumentSaveParticipant', ExtHostDocumentSaveParticipantShape),
	ExtHostEditors: createExtId<ExtHostEditorsShape>('ExtHostEditors', ExtHostEditorsShape),
	ExtHostExplorers: createExtId<ExtHostTreeExplorersShape>('ExtHostExplorers', ExtHostTreeExplorersShape),
	ExtHostFileSystemEventService: createExtId<ExtHostFileSystemEventServiceShape>('ExtHostFileSystemEventService', ExtHostFileSystemEventServiceShape),
	ExtHostHeapService: createExtId<ExtHostHeapServiceShape>('ExtHostHeapMonitor', ExtHostHeapServiceShape),
	ExtHostLanguageFeatures: createExtId<ExtHostLanguageFeaturesShape>('ExtHostLanguageFeatures', ExtHostLanguageFeaturesShape),
	ExtHostQuickOpen: createExtId<ExtHostQuickOpenShape>('ExtHostQuickOpen', ExtHostQuickOpenShape),
	ExtHostExtensionService: createExtId<ExtHostExtensionServiceShape>('ExtHostExtensionService', ExtHostExtensionServiceShape),
	ExtHostTerminalService: createExtId<ExtHostTerminalServiceShape>('ExtHostTerminalService', ExtHostTerminalServiceShape),
	ExtHostSCM: createExtId<ExtHostSCMShape>('ExtHostSCM', ExtHostSCMShape)
};
