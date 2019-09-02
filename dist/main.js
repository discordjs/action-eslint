"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const github_1 = require("@actions/github");
const core_1 = require("@actions/core");
const { GITHUB_TOKEN, GITHUB_SHA, GITHUB_WORKSPACE } = process.env;
const ACTION_NAME = 'ESLint';
const EXTENSIONS = new Set(['.ts', '.js']);
async function lint(files) {
    const { CLIEngine } = await Promise.resolve().then(() => require(path_1.join(process.cwd(), 'node_modules/eslint')));
    const cli = new CLIEngine({
        extensions: [...EXTENSIONS],
        ignorePath: '.gitignore'
    });
    const report = cli.executeOnFiles(files || ['src']);
    const { results, errorCount, warningCount } = report;
    const levels = ['notice', 'warning', 'failure'];
    const annotations = [];
    const consoleOutput = [];
    const consoleLevels = [, 'warning', 'error'];
    for (const res of results) {
        const { filePath, messages } = res;
        const path = filePath.substring(GITHUB_WORKSPACE.length + 1);
        for (const msg of messages) {
            const { line, endLine, column, endColumn, severity, ruleId, message } = msg;
            const annotationLevel = levels[severity];
            const consoleLevel = consoleLevels[severity];
            annotations.push({
                path,
                start_line: line,
                end_line: endLine || line,
                start_column: column,
                end_column: endColumn || column,
                annotation_level: annotationLevel,
                title: ruleId || ACTION_NAME,
                message: `${message}${ruleId ? `\nhttps://eslint.org/docs/rules/${ruleId}` : ''}`
            });
            consoleOutput.push(`${path}\n`);
            consoleOutput.push(`##[${consoleLevel}]  ${line}:${column}  ${consoleLevel}  ${message}  ${ruleId}\n\n`);
        }
    }
    console.log(consoleOutput.join(''));
    return {
        conclusion: errorCount > 0 ? 'failure' : 'success',
        output: {
            title: ACTION_NAME,
            summary: `${errorCount} error(s), ${warningCount} warning(s) found`,
            annotations
        }
    };
}
async function run() {
    const octokit = new github_1.GitHub(GITHUB_TOKEN);
    let currentSha;
    let info;
    let lintFiles;
    if (github_1.context.issue && github_1.context.issue.number) {
        try {
            info = await octokit.graphql(`query($owner: String!, $name: String!, $prNumber: Int!) {
				repository(owner: $owner, name: $name) {
					pullRequest(number: $prNumber) {
						files(first: 100) {
							nodes {
								path
							}
						}
						commits(last: 1) {
							nodes {
								commit {
									oid
								}
							}
						}
					}
				}
			}`, {
                owner: github_1.context.repo.owner,
                name: github_1.context.repo.repo,
                prNumber: github_1.context.issue.number
            });
        }
        catch {
            console.log('##[warning] Token doesn\'t have permission to access this resource.');
        }
        if (info) {
            currentSha = info.repository.pullRequest.commits.nodes[0].commit.oid;
            const files = info.repository.pullRequest.files.nodes;
            lintFiles = files.filter((file) => EXTENSIONS.has(path_1.extname(file.path)) && !file.path.includes('.d.ts')).map((f) => f.path);
        }
        else {
            currentSha = GITHUB_SHA;
        }
    }
    else {
        try {
            info = await octokit.repos.getCommit({ owner: github_1.context.repo.owner, repo: github_1.context.repo.repo, ref: GITHUB_SHA });
        }
        catch {
            console.log('##[warning] Token doesn\'t have permission to access this resource.');
        }
        if (info) {
            const files = info.data.files;
            lintFiles = files.filter(file => EXTENSIONS.has(path_1.extname(file.filename)) && !file.filename.includes('.d.ts') && file.status !== 'removed' && file.status !== 'changed').map(f => f.filename);
        }
        currentSha = GITHUB_SHA;
    }
    core_1.debug(`Commit: ${currentSha}`);
    let id;
    const jobName = core_1.getInput('job-name');
    if (jobName) {
        try {
            const checks = await octokit.checks.listForRef({
                ...github_1.context.repo,
                status: 'in_progress',
                ref: currentSha
            });
            const check = checks.data.check_runs.find(({ name }) => name.toLowerCase() === jobName.toLowerCase());
            if (check)
                id = check.id;
        }
        catch {
            console.log('##[warning] Token doesn\'t have permission to access this resource.');
        }
    }
    if (!id) {
        try {
            id = (await octokit.checks.create({
                ...github_1.context.repo,
                name: ACTION_NAME,
                head_sha: currentSha,
                status: 'in_progress',
                started_at: new Date().toISOString()
            })).data.id;
        }
        catch (error) {
            console.log('##[warning] Token doesn\'t have permission to access this resource.');
        }
    }
    try {
        const lintAll = core_1.getInput('lint-all');
        const { conclusion, output } = await lint(lintAll ? null : lintFiles);
        if (id) {
            try {
                await octokit.checks.update({
                    ...github_1.context.repo,
                    check_run_id: id,
                    completed_at: new Date().toISOString(),
                    conclusion,
                    output
                });
            }
            catch {
                console.log('##[warning] Token doesn\'t have permission to access this resource.');
            }
        }
        core_1.debug(output.summary);
        if (conclusion === 'failure')
            core_1.setFailed(output.summary);
    }
    catch (error) {
        if (id) {
            try {
                await octokit.checks.update({
                    ...github_1.context.repo,
                    check_run_id: id,
                    conclusion: 'failure',
                    completed_at: new Date().toISOString()
                });
            }
            catch {
                console.log('##[warning] Token doesn\'t have permission to access this resource.');
            }
        }
        core_1.setFailed(error.message);
    }
}
run();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIvIiwic291cmNlcyI6WyJtYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsK0JBQXFDO0FBRXJDLDRDQUFrRDtBQUNsRCx3Q0FBMkQ7QUFFM0QsTUFBTSxFQUFFLFlBQVksRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDO0FBRW5FLE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQztBQUM3QixNQUFNLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBRTNDLEtBQUssVUFBVSxJQUFJLENBQUMsS0FBc0I7SUFDekMsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLDJDQUFhLFdBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLEVBQUUscUJBQXFCLENBQUMsRUFBNEIsQ0FBQztJQUMxRyxNQUFNLEdBQUcsR0FBRyxJQUFJLFNBQVMsQ0FBQztRQUN6QixVQUFVLEVBQUUsQ0FBQyxHQUFHLFVBQVUsQ0FBQztRQUMzQixVQUFVLEVBQUUsWUFBWTtLQUN4QixDQUFDLENBQUM7SUFDSCxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsY0FBYyxDQUFDLEtBQUssSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDcEQsTUFBTSxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLEdBQUcsTUFBTSxDQUFDO0lBQ3JELE1BQU0sTUFBTSxHQUE4RCxDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDM0csTUFBTSxXQUFXLEdBQTBDLEVBQUUsQ0FBQztJQUM5RCxNQUFNLGFBQWEsR0FBYSxFQUFFLENBQUM7SUFDbkMsTUFBTSxhQUFhLEdBQUcsQ0FBQyxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUM3QyxLQUFLLE1BQU0sR0FBRyxJQUFJLE9BQU8sRUFBRTtRQUMx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QUcsRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgam9pbiwgZXh0bmFtZSB9IGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgQ2hlY2tzVXBkYXRlUGFyYW1zT3V0cHV0QW5ub3RhdGlvbnMsIENoZWNrc0NyZWF0ZVBhcmFtcyB9IGZyb20gJ0BvY3Rva2l0L3Jlc3QnO1xuaW1wb3J0IHsgR2l0SHViLCBjb250ZXh0IH0gZnJvbSAnQGFjdGlvbnMvZ2l0aHViJztcbmltcG9ydCB7IGdldElucHV0LCBzZXRGYWlsZWQsIGRlYnVnIH0gZnJvbSAnQGFjdGlvbnMvY29yZSc7XG5cbmNvbnN0IHsgR0lUSFVCX1RPS0VOLCBHSVRIVUJfU0hBLCBHSVRIVUJfV09SS1NQQUNFIH0gPSBwcm9jZXNzLmVudjtcblxuY29uc3QgQUNUSU9OX05BTUUgPSAnRVNMaW50JztcbmNvbnN0IEVYVEVOU0lPTlMgPSBuZXcgU2V0KFsnLnRzJywgJy5qcyddKTtcblxuYXN5bmMgZnVuY3Rpb24gbGludChmaWxlczogc3RyaW5nW10gfCBudWxsKSB7XG5cdGNvbnN0IHsgQ0xJRW5naW5lIH0gPSBhd2FpdCBpbXBvcnQoam9pbihwcm9jZXNzLmN3ZCgpLCAnbm9kZV9tb2R1bGVzL2VzbGludCcpKSBhcyB0eXBlb2YgaW1wb3J0KCdlc2xpbnQnKTtcblx0Y29uc3QgY2xpID0gbmV3IENMSUVuZ2luZSh7XG5cdFx0ZXh0ZW5zaW9uczogWy4uLkVYVEVOU0lPTlNdLFxuXHRcdGlnbm9yZVBhdGg6ICcuZ2l0aWdub3JlJ1xuXHR9KTtcblx0Y29uc3QgcmVwb3J0ID0gY2xpLmV4ZWN1dGVPbkZpbGVzKGZpbGVzIHx8IFsnc3JjJ10pO1xuXHRjb25zdCB7IHJlc3VsdHMsIGVycm9yQ291bnQsIHdhcm5pbmdDb3VudCB9ID0gcmVwb3J0O1xuXHRjb25zdCBsZXZlbHM6IENoZWNrc1VwZGF0ZVBhcmFtc091dHB1dEFubm90YXRpb25zWydhbm5vdGF0aW9uX2xldmVsJ11bXSA9IFsnbm90aWNlJywgJ3dhcm5pbmcnLCAnZmFpbHVyZSddO1xuXHRjb25zdCBhbm5vdGF0aW9uczogQ2hlY2tzVXBkYXRlUGFyYW1zT3V0cHV0QW5ub3RhdGlvbnNbXSA9IFtdO1xuXHRjb25zdCBjb25zb2xlT3V0cHV0OiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBjb25zb2xlTGV2ZWxzID0gWywgJ3dhcm5pbmcnLCAnZXJyb3InXTtcblx0Zm9yIChjb25zdCByZXMgb2YgcmVzdWx0cykge1xuXHRcdGNvbnN0IHsgZmlsZVBhdGgsIG1lc3NhZ2VzIH0gPSByZXM7XG5cdFx0Y29uc3QgcGF0aCA9IGZpbGVQYXRoLnN1YnN0cmluZyhHSVRIVUJfV09SS1NQQUNFIS5sZW5ndGggKyAxKTtcblx0XHRmb3IgKGNvbnN0IG1zZyBvZiBtZXNzYWdlcykge1xuXHRcdFx0Y29uc3QgeyBsaW5lLCBlbmRMaW5lLCBjb2x1bW4sIGVuZENvbHVtbiwgc2V2ZXJpdHksIHJ1bGVJZCwgbWVzc2FnZSB9ID0gbXNnO1xuXHRcdFx0Y29uc3QgYW5ub3RhdGlvbkxldmVsID0gbGV2ZWxzW3NldmVyaXR5XTtcblx0XHRcdGNvbnN0IGNvbnNvbGVMZXZlbCA9IGNvbnNvbGVMZXZlbHNbc2V2ZXJpdHldO1xuXHRcdFx0YW5ub3RhdGlvbnMucHVzaCh7XG5cdFx0XHRcdHBhdGgsXG5cdFx0XHRcdHN0YXJ0X2xpbmU6IGxpbmUsXG5cdFx0XHRcdGVuZF9saW5lOiBlbmRMaW5lIHx8IGxpbmUsXG5cdFx0XHRcdHN0YXJ0X2NvbHVtbjogY29sdW1uLFxuXHRcdFx0XHRlbmRfY29sdW1uOiBlbmRDb2x1bW4gfHwgY29sdW1uLFxuXHRcdFx0XHRhbm5vdGF0aW9uX2xldmVsOiBhbm5vdGF0aW9uTGV2ZWwsXG5cdFx0XHRcdHRpdGxlOiBydWxlSWQgfHwgQUNUSU9OX05BTUUsXG5cdFx0XHRcdG1lc3NhZ2U6IGAke21lc3NhZ2V9JHtydWxlSWQgPyBgXFxuaHR0cHM6Ly9lc2xpbnQub3JnL2RvY3MvcnVsZXMvJHtydWxlSWR9YCA6ICcnfWBcblx0XHRcdH0pO1xuXHRcdFx0Y29uc29sZU91dHB1dC5wdXNoKGAke3BhdGh9XFxuYCk7XG5cdFx0XHRjb25zb2xlT3V0cHV0LnB1c2goYCMjWyR7Y29uc29sZUxldmVsfV0gICR7bGluZX06JHtjb2x1bW59ICAke2NvbnNvbGVMZXZlbH0gICR7bWVzc2FnZX0gICR7cnVsZUlkfVxcblxcbmApO1xuXHRcdH1cblx0fVxuXHRjb25zb2xlLmxvZyhjb25zb2xlT3V0cHV0LmpvaW4oJycpKTtcblxuXHRyZXR1cm4ge1xuXHRcdGNvbmNsdXNpb246IGVycm9yQ291bnQgPiAwID8gJ2ZhaWx1cmUnIDogJ3N1Y2Nlc3MnIGFzIENoZWNrc0NyZWF0ZVBhcmFtc1snY29uY2x1c2lvbiddLFxuXHRcdG91dHB1dDoge1xuXHRcdFx0dGl0bGU6IEFDVElPTl9OQU1FLFxuXHRcdFx0c3VtbWFyeTogYCR7ZXJyb3JDb3VudH0gZXJyb3IocyksICR7d2FybmluZ0NvdW50fSB3YXJuaW5nKHMpIGZvdW5kYCxcblx0XHRcdGFubm90YXRpb25zXG5cdFx0fVxuXHR9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBydW4oKSB7XG5cdGNvbnN0IG9jdG9raXQgPSBuZXcgR2l0SHViKEdJVEhVQl9UT0tFTiEpO1xuXG5cdGxldCBjdXJyZW50U2hhOiBzdHJpbmc7XG5cdGxldCBpbmZvO1xuXHRsZXQgbGludEZpbGVzO1xuXHRpZiAoY29udGV4dC5pc3N1ZSAmJiBjb250ZXh0Lmlzc3VlLm51bWJlcikge1xuXHRcdHRyeSB7XG5cdFx0XHRpbmZvID0gYXdhaXQgb2N0b2tpdC5ncmFwaHFsKGBxdWVyeSgkb3duZXI6IFN0cmluZyEsICRuYW1lOiBTdHJpbmchLCAkcHJOdW1iZXI6IEludCEpIHtcblx0XHRcdFx0cmVwb3NpdG9yeShvd25lcjogJG93bmVyLCBuYW1lOiAkbmFtZSkge1xuXHRcdFx0XHRcdHB1bGxSZXF1ZXN0KG51bWJlcjogJHByTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRmaWxlcyhmaXJzdDogMTAwKSB7XG5cdFx0XHRcdFx0XHRcdG5vZGVzIHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbW1pdHMobGFzdDogMSkge1xuXHRcdFx0XHRcdFx0XHRub2RlcyB7XG5cdFx0XHRcdFx0XHRcdFx0Y29tbWl0IHtcblx0XHRcdFx0XHRcdFx0XHRcdG9pZFxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fWAsXG5cdFx0XHR7XG5cdFx0XHRcdG93bmVyOiBjb250ZXh0LnJlcG8ub3duZXIsXG5cdFx0XHRcdG5hbWU6IGNvbnRleHQucmVwby5yZXBvLFxuXHRcdFx0XHRwck51bWJlcjogY29udGV4dC5pc3N1ZS5udW1iZXJcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Y29uc29sZS5sb2coJyMjW3dhcm5pbmddIFRva2VuIGRvZXNuXFwndCBoYXZlIHBlcm1pc3Npb24gdG8gYWNjZXNzIHRoaXMgcmVzb3VyY2UuJyk7XG5cdFx0fVxuXHRcdGlmIChpbmZvKSB7XG5cdFx0XHRjdXJyZW50U2hhID0gaW5mby5yZXBvc2l0b3J5LnB1bGxSZXF1ZXN0LmNvbW1pdHMubm9kZXNbMF0uY29tbWl0Lm9pZDtcblx0XHRcdGNvbnN0IGZpbGVzID0gaW5mby5yZXBvc2l0b3J5LnB1bGxSZXF1ZXN0LmZpbGVzLm5vZGVzO1xuXHRcdFx0bGludEZpbGVzID0gZmlsZXMuZmlsdGVyKChmaWxlOiB7IHBhdGg6IHN0cmluZyB9KSA9PiBFWFRFTlNJT05TLmhhcyhleHRuYW1lKGZpbGUucGF0aCkpICYmICFmaWxlLnBhdGguaW5jbHVkZXMoJy5kLnRzJykpLm1hcCgoZjogeyBwYXRoOiBzdHJpbmcgfSkgPT4gZi5wYXRoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y3VycmVudFNoYSA9IEdJVEhVQl9TSEEhO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHR0cnkge1xuXHRcdFx0aW5mbyA9IGF3YWl0IG9jdG9raXQucmVwb3MuZ2V0Q29tbWl0KHsgb3duZXI6IGNvbnRleHQucmVwby5vd25lciwgcmVwbzogY29udGV4dC5yZXBvLnJlcG8sIHJlZjogR0lUSFVCX1NIQSEgfSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRjb25zb2xlLmxvZygnIyNbd2FybmluZ10gVG9rZW4gZG9lc25cXCd0IGhhdmUgcGVybWlzc2lvbiB0byBhY2Nlc3MgdGhpcyByZXNvdXJjZS4nKTtcblx0XHR9XG5cdFx0aWYgKGluZm8pIHtcblx0XHRcdGNvbnN0IGZpbGVzID0gaW5mby5kYXRhLmZpbGVzO1xuXHRcdFx0bGludEZpbGVzID0gZmlsZXMuZmlsdGVyKGZpbGUgPT4gRVhURU5TSU9OUy5oYXMoZXh0bmFtZShmaWxlLmZpbGVuYW1lKSkgJiYgIWZpbGUuZmlsZW5hbWUuaW5jbHVkZXMoJy5kLnRzJykgJiYgZmlsZS5zdGF0dXMgIT09ICdyZW1vdmVkJyAmJiBmaWxlLnN0YXR1cyAhPT0gJ2NoYW5nZWQnKS5tYXAoZiA9PiBmLmZpbGVuYW1lKTtcblx0XHR9XG5cdFx0Y3VycmVudFNoYSA9IEdJVEhVQl9TSEEhO1xuXHR9XG5cdGRlYnVnKGBDb21taXQ6ICR7Y3VycmVudFNoYX1gKTtcblxuXHRsZXQgaWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0Y29uc3Qgam9iTmFtZSA9IGdldElucHV0KCdqb2ItbmFtZScpO1xuXHRpZiAoam9iTmFtZSkge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjaGVja3MgPSBhd2FpdCBvY3Rva2l0LmNoZWNrcy5saXN0Rm9yUmVmKHtcblx0XHRcdFx0Li4uY29udGV4dC5yZXBvLFxuXHRcdFx0XHRzdGF0dXM6ICdpbl9wcm9ncmVzcycsXG5cdFx0XHRcdHJlZjogY3VycmVudFNoYVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjaGVjayA9IGNoZWNrcy5kYXRhLmNoZWNrX3J1bnMuZmluZCgoeyBuYW1lIH0pID0+IG5hbWUudG9Mb3dlckNhc2UoKSA9PT0gam9iTmFtZS50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdGlmIChjaGVjaykgaWQgPSBjaGVjay5pZDtcblx0XHR9IGNhdGNoIHtcblx0XHRcdGNvbnNvbGUubG9nKCcjI1t3YXJuaW5nXSBUb2tlbiBkb2VzblxcJ3QgaGF2ZSBwZXJtaXNzaW9uIHRvIGFjY2VzcyB0aGlzIHJlc291cmNlLicpO1xuXHRcdH1cblx0fVxuXHRpZiAoIWlkKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGlkID0gKGF3YWl0IG9jdG9raXQuY2hlY2tzLmNyZWF0ZSh7XG5cdFx0XHRcdC4uLmNvbnRleHQucmVwbyxcblx0XHRcdFx0bmFtZTogQUNUSU9OX05BTUUsXG5cdFx0XHRcdGhlYWRfc2hhOiBjdXJyZW50U2hhLFxuXHRcdFx0XHRzdGF0dXM6ICdpbl9wcm9ncmVzcycsXG5cdFx0XHRcdHN0YXJ0ZWRfYXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuXHRcdFx0fSkpLmRhdGEuaWQ7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnNvbGUubG9nKCcjI1t3YXJuaW5nXSBUb2tlbiBkb2VzblxcJ3QgaGF2ZSBwZXJtaXNzaW9uIHRvIGFjY2VzcyB0aGlzIHJlc291cmNlLicpO1xuXHRcdH1cblx0fVxuXG5cdHRyeSB7XG5cdFx0Y29uc3QgbGludEFsbCA9IGdldElucHV0KCdsaW50LWFsbCcpO1xuXHRcdGNvbnN0IHsgY29uY2x1c2lvbiwgb3V0cHV0IH0gPSBhd2FpdCBsaW50KGxpbnRBbGwgPyBudWxsIDogbGludEZpbGVzKTtcblx0XHRpZiAoaWQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IG9jdG9raXQuY2hlY2tzLnVwZGF0ZSh7XG5cdFx0XHRcdFx0Li4uY29udGV4dC5yZXBvLFxuXHRcdFx0XHRcdGNoZWNrX3J1bl9pZDogaWQsXG5cdFx0XHRcdFx0Y29tcGxldGVkX2F0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdFx0Y29uY2x1c2lvbixcblx0XHRcdFx0XHRvdXRwdXRcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Y29uc29sZS5sb2coJyMjW3dhcm5pbmddIFRva2VuIGRvZXNuXFwndCBoYXZlIHBlcm1pc3Npb24gdG8gYWNjZXNzIHRoaXMgcmVzb3VyY2UuJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGRlYnVnKG91dHB1dC5zdW1tYXJ5KTtcblx0XHRpZiAoY29uY2x1c2lvbiA9PT0gJ2ZhaWx1cmUnKSBzZXRGYWlsZWQob3V0cHV0LnN1bW1hcnkpO1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdGlmIChpZCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgb2N0b2tpdC5jaGVja3MudXBkYXRlKHtcblx0XHRcdFx0XHQuLi5jb250ZXh0LnJlcG8sXG5cdFx0XHRcdFx0Y2hlY2tfcnVuX2lkOiBpZCxcblx0XHRcdFx0XHRjb25jbHVzaW9uOiAnZmFpbHVyZScsXG5cdFx0XHRcdFx0Y29tcGxldGVkX2F0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Y29uc29sZS5sb2coJyMjW3dhcm5pbmddIFRva2VuIGRvZXNuXFwndCBoYXZlIHBlcm1pc3Npb24gdG8gYWNjZXNzIHRoaXMgcmVzb3VyY2UuJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHNldEZhaWxlZChlcnJvci5tZXNzYWdlKTtcblx0fVxufVxuXG5ydW4oKTtcbiJdfQ==