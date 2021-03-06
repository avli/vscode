/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/platform';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IPreferencesService } from 'vs/workbench/parts/preferences/common/preferences';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import baseplatform = require('vs/base/common/platform');
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';


class TrustContribution implements IWorkbenchContribution {

	private toDispose: IDisposable[] = [];
	private isUntrusted = false;

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IWorkspaceConfigurationService private workspaceConfigurationService: IWorkspaceConfigurationService,
		@IPreferencesService private preferencesService: IPreferencesService,
		@IMessageService private messageService: IMessageService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		lifecycleService.onShutdown(this.dispose, this);
		this.toDispose.push(this.workspaceConfigurationService.onDidUpdateConfiguration(e => this.checkWorkspaceTrust()));
		this.checkWorkspaceTrust();
	}

	getId(): string {
		return 'trust';
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}

	private checkWorkspaceTrust(): void {

		if (this.isUntrusted) {
			return;
		}

		if (this.workspaceConfigurationService.isExplicitlyUntrusted()) {
			this.isUntrusted = true;
			return;
		}

		this.isUntrusted = this.workspaceConfigurationService.getUntrustedConfigurations().length > 0;
		if (this.isUntrusted) {
			this.showTrustWarning();
		}
	}

	private getWorkspaceTrustKey(): string {
		let path = this.workspaceContextService.getWorkspace().resource.fsPath;
		if (baseplatform.isWindows && path.length > 2) {
			if (path.charAt(1) === ':') {
				return path.charAt(0).toLocaleUpperCase().concat(path.substr(1));
			}
		}
		return path;
	}

	private updateTrustInUserSettings(trust: boolean, writeToBuffer: boolean, autoSave: boolean): TPromise<void> {
		const key = 'security.workspacesTrustedToSpecifyExecutables';
		const workspace = this.getWorkspaceTrustKey();

		const value = this.configurationService.lookup(key).user || {};
		value[workspace] = trust;

		return this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: key, value: value }, { writeToBuffer: writeToBuffer, autoSave: autoSave });
	}

	private showTrustWarning(): void {
		const message = nls.localize('untrustedWorkspace', "This workspace specifies executables. While the workspace is untrusted, these settings are being ignored.");

		const openWorkspaceSettings = new Action('trust.openWorkspaceSettings', nls.localize('openWorkspaceSettings', 'Review Settings'), '', true, () => {
			this.telemetryService.publicLog('workspace.trust.review');
			return this.preferencesService.openWorkspaceSettings().then(() => false);
		});

		const trustWorkspace = new Action('trust.trustWorkspace', nls.localize('trustWorkspace', 'Trust Workspace'), '', true, () => {
			this.telemetryService.publicLog('workspace.trust.granted');
			return this.updateTrustInUserSettings(true, true, false).then(() => this.preferencesService.openGlobalSettings());
		});

		const noChange = new Action('trust.noChange', nls.localize('noChange', 'Do Not Trust Workspace'), '', true, () => {
			this.telemetryService.publicLog('workspace.trust.rejected');
			return this.updateTrustInUserSettings(false, true, true);
		});

		const actions = [openWorkspaceSettings, trustWorkspace, noChange];
		this.messageService.show(Severity.Warning, { message, actions });
		this.telemetryService.publicLog('workspace.trust.warning');
	}
}

const workbenchRegistry = <IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(TrustContribution);
