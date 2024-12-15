import { Request } from "tedious";
import { ConnectionConfiguration } from "tedious"
import { Connection } from "tedious"

export class DatabaseConnection
{
    private config: ConnectionConfiguration;
    private logger: any

    constructor(logger: any)
    {
        this.config =
        {
            server: 'KimHyperVVMServ\\SQLExpress',
            authentication:
            {
                type: 'default',
                options:
                {
                    userName: 'sa',
                    password: 'ydzx@2024',
                    
                }
            },
            options: {
                trustServerCertificate: true,
                cryptoCredentialsDetails: {
                    minVersion: 'TLSv1'
                },
                rowCollectionOnRequestCompletion: true
            }
        }

        this.logger = logger
    }

    private getConnection(): Promise<Connection>
    {
        return new Promise<Connection>((resolve, reject) =>
        {
            let connection = new Connection(this.config)
            connection.connect()
            connection.on('connect', err =>
            {
                if(err)
                {
                    this.logger.error('建立与用户数据库的连接失败')
                    this.logger.error(err)
                    reject(err)
                }
                else
                {
                    this.logger.info('建立了与用户数据库的连接')
                    resolve(connection)
                }
            })
        })
    }

    exec(cmd: string)
    {
        return new Promise<User[]>(async (resolve, reject) =>
        {
            let connection = await this.getConnection()
                .catch(err =>
                {
                    this.logger.error(err)
                    reject(err)
                })

            if(!connection)
            {
                return
            }

            let request = new Request(
                cmd,
                (err, rowCount, rows) =>
                {
                    if(err)
                    {
                        this.logger.error('执行该SQL命令时出错: ' + cmd)
                        this.logger.error(err)
                        reject(err)
                    }
                    else if(rowCount == 0)
                    {
                        this.logger.info('成功执行了SQL命令: ' + cmd + ', 返回行数: 0')
                        resolve([])
                    }
                    else
                    {
                        let users: User[] = []
                        rows.forEach((row: { value: any; }[]) =>
                        {
                            users.push({
                                yuandongNumber: row[0].value,
                                username: row[1].value,
                                password: row[2].value,
                                qqNumber: row[3].value,
                                verificationCode: row[4].value,
                                isVerified: Boolean(row[5].value),
                                timestamp: row[6].value,
                            })
                        });
                        this.logger.info('成功执行了SQL命令: ' + cmd + ', 返回行数: ' + rowCount)
                        this.logger.info(users)
                        resolve(users);
                        (connection as Connection).close()
                    }
                }
            )

            connection.execSql(request)
        })
    }

    test()
    {
        return new Promise<void>((resolve, reject) =>
        {
            this.getConnection()
                .then(connection =>
                {
                    resolve()
                    connection.close()
                })
                .catch(err =>
                {
                    reject(err)
                })
        })
    }
}

export type User =
{
    yuandongNumber: number,
    username: string,
    password: string,
    qqNumber: string | null,
    verificationCode: string,
    isVerified: boolean,
    timestamp: number
}

export type Message =
{
    timestamp: number,
    id: number
    senderQq: string | null,
    senderName: string | null,
    messageChain: string
}