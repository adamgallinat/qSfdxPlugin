import {core, flags, SfdxCommand} from '@salesforce/command';
import {exec} from 'shelljs';
import {debug} from 'debug';
import {readFile, readFileSync} from 'fs';

// Initialize Messages with the current plugin directory
core.Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = core.Messages.loadMessages('sfdx_plugins', 'org');

interface RecordType {
  Id: string;
  DeveloperName: string;
  SobjectType: string;
}
interface attr {
  type: string;
  referenceId: string;
}
interface Record {
  attributes: attr,
  RecordTypeId?: string
}

export default class Org extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
  `$ sfdx q:data:import --targetusername SCRATCH_ORG --plan data/sample-plan.js`,
  `$ sfdx q:data:import --targetusername SCRATCH_ORG --file data/sample-file.js`
  ];

  public static args = [];

  protected static flagsConfig = {
    // flag with a value (-n, --name=VALUE)
    plan: flags.string({char: 'p', description: 'tree export plan', required: false}),
    file: flags.string({char: 'f', description: 'tree export file', required: false})
  };

  // Comment this out if your command does not require an org username
  protected static requiresUsername = true;

  // Comment this out if your command does not support a hub org username
  protected static supportsDevhubUsername = true;

  // Set this to true if your command requires a project workspace; 'requiresProject' is false by default
  protected static requiresProject = false;

  public async run(): Promise<core.AnyJson> {
    console.log('retrieving recordtypes');
    const conn = this.org.getConnection();
    const query = `Select Id, DeveloperName, SObjectType from RecordType WHERE IsActive = true`;

    // Query the org
    const result = await conn.query<RecordType>(query);
    if (!result.records || result.records.length <= 0) {
      throw new core.SfdxError('No active recordtypes found in default org. May require force:source:push');
    }
    const sobjRecordTypeMap = new Map<string,Map<string,string>>();
    for (let recordtype of result.records) {
      if (!sobjRecordTypeMap.has(recordtype.SobjectType)) {
        sobjRecordTypeMap.set(recordtype.SobjectType, new Map<string,string>());
      }
      sobjRecordTypeMap.get(recordtype.SobjectType).set(recordtype.DeveloperName, recordtype.Id);
    }
    console.log(sobjRecordTypeMap);

    const file = this.flags.file;
    const plan = this.flags.plan;
    if (!file && !plan) {
      throw new core.SfdxError('File or plan required');
    }
    if (file) {
      const fileData = JSON.parse(readFileSync(file, 'utf8')).records;
      const revisedFileData = this.reviseRecordData(fileData, sobjRecordTypeMap);
      console.log(revisedFileData);
    }

    return {};
  }

  private reviseRecordData(fileData : Record[], recordTypeMap: Map<string,Map<string,string>>): Record[] {
    for (let record of fileData) {
      const sobjectType = record.attributes.type;
      if (record.RecordTypeId && (typeof record.RecordTypeId === 'string')) {
        if (!recordTypeMap.has(sobjectType) || !recordTypeMap.get(sobjectType).has(record.RecordTypeId))
          throw new core.SfdxError('RecordType missing');
        record.RecordTypeId = recordTypeMap.get(sobjectType).get(record.RecordTypeId);
      }
      for (let prop in record) {
        if (record[prop].records) {
          record[prop].records = this.reviseRecordData(record[prop].records, recordTypeMap);
        }
      }
    }
    return fileData;
  }
}
