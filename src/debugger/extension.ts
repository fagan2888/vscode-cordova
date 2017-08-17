// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as child_process from 'child_process';
import {CordovaProjectHelper} from '../utils/cordovaProjectHelper';
import * as os from 'os';
import * as Q from 'q';
import * as path from 'path';
import * as util from 'util';
import * as semver from 'semver';

export function execCommand(command: string, args: string[], errorLogger: (message: string) => void): Q.Promise<string> {
    let deferred = Q.defer<string>();
    let proc = child_process.spawn(command, args, { stdio: 'pipe' });
    let stderr = '';
    let stdout = '';
    proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
    });
    proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
    });
    proc.on('error', (err: Error) => {
        deferred.reject(err);
    });
    proc.on('close', (code: number) => {
        if (code !== 0) {
            errorLogger(stderr);
            errorLogger(stdout);
            deferred.reject(`Error running '${command} ${args.join(' ')}'`);
        }
        deferred.resolve(stdout);
    });

    return deferred.promise;
}

export function cordovaRunCommand(args: string[], cordovaRootPath: string): Q.Promise<string[]> {
    let defer = Q.defer<string[]>();
    let isIonicProject = CordovaProjectHelper.isIonicProject(cordovaRootPath);
    let cliName = isIonicProject ? 'ionic' : 'cordova';
    let output = '';
    let stderr = '';
    let process = cordovaStartCommand(args, cordovaRootPath);
    // suppress the following strings because they are not actual errors:
    let stringsToSuppress = ['Run an Ionic project on a connected device'];

    process.stderr.on('data', data => {
        stderr += data.toString();
        for (var i = 0; i < stringsToSuppress.length; i++) {
            if (data.toString().indexOf(stringsToSuppress[i]) >= 0) {
                return;
            }
        }
        defer.notify([data.toString(), 'stderr']);
    });
    process.stdout.on('data', data => {
        output += data.toString();
        defer.notify([data.toString(), 'stdout']);
        if (isIonicProject && data.toString().indexOf('LAUNCH SUCCESS') >= 0) {
            defer.resolve([output, stderr]);
        }
    });
    process.on('exit', exitCode => {
        if (exitCode) {
            defer.reject(new Error(util.format('\'%s %s\' failed with exit code %d', cliName, args.join(' '), exitCode)));
        } else {
            defer.resolve([output, stderr]);
        }
    });
    process.on('error', error => {
        defer.reject(error);
    });

    return defer.promise;
}

export function cordovaStartCommand(args: string[], cordovaRootPath: string): child_process.ChildProcess {
    let cliName = CordovaProjectHelper.isIonicProject(cordovaRootPath) ? 'ionic' : 'cordova';
    let commandExtension = os.platform() === 'win32' ? '.cmd' : '';
    let command = cliName + commandExtension;
    let isIonicServe: boolean = args.indexOf('serve') >= 0;

    if (cliName === 'ionic' && !isIonicServe) {
        try {
            let ionicInfo = child_process.spawnSync(command, ['-v'], {
                cwd: cordovaRootPath
            });
            let ionicVersion = ionicInfo.stdout.toString().trim();
            if (semver.gte(ionicVersion, '3.0.0')) {
                args.unshift('cordova');
            }
        } catch (err) {
            console.error('Error while detecting Ionic CLI version', err);
        }
    }

    return child_process.spawn(command, args, { cwd: cordovaRootPath });
}

export function killTree(processId: number): void {
    const cmd = process.platform === 'win32' ?
        `taskkill.exe /F /T /PID` :
        path.join(__dirname, '../../../scripts/terminateProcess.sh')

    try {
        child_process.execSync(`${cmd} ${processId}`);
    } catch (err) {
    }
}

export function killChildProcess(childProcess: child_process.ChildProcess): Q.Promise<void> {
    killTree(childProcess.pid);
    return Q<void>(void 0);
}
