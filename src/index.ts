import Mirai, { EventType, Message, MessageType, MiraiApiHttpSetting } from "mirai-ts";
import { readFileSync } from "fs";
import path from "path";
import jsyaml from "js-yaml";
import { DatabaseConnection, User } from "./database";

const qq = 1554547983

let settingYml = ''

try
{
    settingYml = readFileSync
    (
        path.resolve
        (
            __dirname,
            '../setting.yml'
        ),
        'utf-8'
    )
}
catch (err)
{
    console.error('读取配置文件失败')
    console.error(err)
}

const setting = jsyaml.load(settingYml) as MiraiApiHttpSetting

const mirai = new Mirai(setting)

async function App()
{
    const logger = mirai.logger

    let conn = new DatabaseConnection(logger)

    logger.info('正在测试与用户数据库的连接')

    try
    {
        await conn.test()
            .then(() => {
                logger.success('连接测试通过')
            })
    }
    catch (err)
    {
        logger.error('连接到用户数据库时出现错误')
        logger.error(err)
        return
    }

    await mirai.link(qq)
    mirai.on
    (
        'message',
        (msg) => msgHandler(conn, msg, logger)
    )
    mirai.on(
        'GroupRecallEvent',
        (event) => recallHandler(conn, event, logger)
    )
    mirai.listen()
}

function msgHandler(conn: DatabaseConnection, msg: MessageType.ChatMessage, logger: any)
{
    if (msgExecuteChecker(msg))
    {
        logger.info('捕获到用户 ' + msg.sender.id + ' 发送的指令: ' + msg.plain)
        let reply = (str: string) =>
        {
            msg.reply([Message.Plain(str)])
            logger.info('发送消息: ' + str)
        }
        msgExecuator(conn, msg, reply, logger)
    }

    if (msgSaveChecker(msg))
    {
        msgSaver(conn, msg, logger)
    }
}

function msgSaveChecker(msg: MessageType.ChatMessage): msg is MessageType.GroupMessage
{
    return msg.type == 'GroupMessage' && msg.sender.group.id == 560431031
}

type DevApiResponse =
{
    code: number,
    data: {
        avatar: string,
        nick: string,
        "qzone.avatar": string,
    },
    msg: string,
}

async function msgSaver(conn: DatabaseConnection, msg: MessageType.GroupMessage, logger: any)
{
    let sqlCmd = `INSERT INTO [ydzx].[dbo].[message] VALUES (${Math.floor(Date.now() / 1000)}, ${msg.messageChain[0].id}, '${msg.sender.id}', '${msg.sender.memberName}', NULL, '${JSON.stringify(msg.messageChain.slice(1))}', 0)`
    //                                                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 此处本应从GroupMessage对象获取时间戳，但目前Overflow提供的对象时间有问题，因此改为获取系统时间。
    await conn.exec(sqlCmd)
        .then(() => logger.info(`成功向数据库中写入了了ID为 ${msg.messageChain[0].id} 的消息记录`))
        .catch(err =>
        {
            logger.error(`在向数据库写入ID为 ${msg.messageChain[0].id} 的消息记录时出错`)
            logger.error(err)
        })
}

function msgExecuteChecker(msg: MessageType.ChatMessage): boolean
{
    return msg.plain[0] == '#' &&
    (
        msg.type == 'FriendMessage' ||
        msg.type == 'TempMessage' ||
        (
            msg.type == 'GroupMessage' &&
            msg.sender.group.id == 560431031
        )
    )
}

async function msgExecuator(conn: DatabaseConnection, msg: MessageType.ChatMessage, reply: (str: string) => void, logger: any)
{
    let cmdChain = msg.plain.trim().split(" ")
    switch (cmdChain[0])
    {
        //绑定
        case '#b':
        {
            let selectCmd = "SELECT * FROM [ydzx].[dbo].[user] WHERE verification_code='" + cmdChain[1] + "'"
            
            let unverifiedUsers: User[] = []

            try
            {
                await conn.exec(selectCmd)
                    .then(users =>
                    {
                        users.forEach(user =>
                        {
                            if(!user.isVerified)
                            unverifiedUsers.push(user)
                        })
                    })
            }
            catch (err)
            {
                reply('执行指令时出错。（代码01）')
                break
            }

            if(unverifiedUsers.length == 0)
            {
                reply('绑定代码无效。（代码20）')
                break
            }

            if(unverifiedUsers.length > 1)
            {
                reply('执行指令时出错。（代码10）')
                break
            }

            let bindCmd = "UPDATE [ydzx].[dbo].[user] SET qq_number='" + msg.sender.id + "', is_verified=1 WHERE yuandong_number='" + unverifiedUsers[0].yuandongNumber + "'"

            await conn.exec(bindCmd)
                .then(() => {
                    reply('遠東账号 ' + unverifiedUsers[0].yuandongNumber + ' 与QQ账号 ' + msg.sender.id + ' 绑定成功。')
                })
                .catch((err: Error) => {
                    reply('执行指令时出错。（代码02）')
                })
            break
        }
        //重置密码
        case '#r':
        {
            if(msg.type == 'GroupMessage') {
                reply('请在临时会话中重设密码。（代码22）')
                break
            }

            let selectCmd = "SELECT * FROM [ydzx].[dbo].[user] WHERE qq_number='" + msg.sender.id + "'"

            let users: User[]

            try
            {
                users = await conn.exec(selectCmd)
            }
            catch (err)
            {
                reply('执行指令时出错。（代码01）')
                break
            }

            if(users.length == 0)
            {
                reply('该QQ号未绑定遠東账号。（代码20）')
                break
            }

            if(users.length > 1)
            {
                reply('执行指令时出错。（代码10）')
                break
            }

            if(cmdChain[1].length > 18 || cmdChain[1].length < 8)
            {
                reply('密码长度不合法。密码应不短于8位，不长于18位。（代码21）')
                break
            }

            let resetCmd = "UPDATE [ydzx].[dbo].[user] SET password='" + cmdChain[1] + "', is_verified=1 WHERE qq_number='" + msg.sender.id + "'"

            await conn.exec(resetCmd)
                .then(() => {
                    reply('遠東账号 ' + users[0].yuandongNumber + ' 密码重设为 ' + cmdChain[1] + ' 成功。')
                })
                .catch((err: Error) => {
                    reply('执行指令时出错。（代码02）')
                })
            break
        }
        case '#q':
        {
            let qq_number: string;

            if(cmdChain[1]) qq_number = cmdChain[1]
            else qq_number = msg.sender.id.toString()
            
            let cmd = `SELECT * FROM [ydzx].[dbo].[user] WHERE qq_number='${qq_number}'`;
            
            let users: User[]
            try
            {
                users = await conn.exec(cmd)
            }
            catch (err)
            {
                reply('执行指令时出错。（代码01）')
                break
            }

            if(users.length == 0)
            {
                reply('该QQ号未绑定遠東账号。（代码20）')
                break
            }

            if(users.length > 1)
            {   
                reply('执行指令时出错。（代码10）')
                break
            }

            reply(`QQ号 ${qq_number} 绑定的遠東账号为 ${users[0].yuandongNumber}。`)
            break
        }
        case '#h':
        {
            reply('账号绑定：#b <绑定代码>\n重设密码：#r <密码>（仅限私聊）\n查询遠東账号：#q [QQ号]\n获取帮助：#h')
            break
        }
        default:
        {
            logger.info('指令 ' + msg.plain + ' 无效')
        }
    }
    logger.info('指令 ' + msg.plain + ' 执行完毕')
}

function recallHandler(conn: DatabaseConnection, event: EventType.GroupRecallEvent, logger: any)
{
    if(event.group.id == 560431031)
    {
        conn.exec(`UPDATE [ydzx].[dbo].[message] SET is_recalled=1 WHERE id=${event.messageId}`)
        logger.info(`成功改写数据库中ID为 ${event.messageId} 的消息为已撤回`)
    }
    
}

App()