import * as vscode from 'vscode';
import { PestExtensionManager } from './extensionManager';

export function activate(context: vscode.ExtensionContext) {
	const manager = new PestExtensionManager(context);
	manager.activate();
}
