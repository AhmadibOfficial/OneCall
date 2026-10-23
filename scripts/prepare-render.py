#!/usr/bin/env python3
"""Generate a Render preview; --paid-staging opts into the persistent-storage draft."""
import argparse,json
from pathlib import Path
import yaml

def blueprint(paid=False):
    def value(k,v):return {'key':k,'value':str(v)}
    def secret(k):return {'key':k,'sync':False}
    db={'key':'DATABASE_URL','fromDatabase':{'name':'onecall-staging-db','property':'connectionString'}}
    redis={'key':'REDIS_URL','fromService':{'type':'keyvalue','name':'onecall-staging-cache','property':'connectionString'}}
    api={
        'type':'web','name':'onecall-staging-api','runtime':'docker','region':'frankfurt','plan':'starter' if paid else 'free',
        'branch':'main','dockerfilePath':'./deploy/Dockerfile','dockerContext':'.','autoDeployTrigger':'off','healthCheckPath':'/api/v1/health/ready',
        'envVars':[value('NODE_ENV','production'),value('HOST','0.0.0.0'),value('PORT','10000'),value('APP_NAME','OneCall'),value('APP_VERSION','0.1.0'),value('API_PREFIX','api/v1'),value('TRUST_PROXY','1'),value('DATABASE_POOL_SIZE','5'),db,redis,
          *[{'key':k,'generateValue':True} for k in ['JWT_SECRET','JWT_REFRESH_SECRET','PAYMENT_WEBHOOK_SECRET']],
          {'key':'AUTH_DELIVERY_SECRET','fromService':{'type':'web','name':'onecall-staging-delivery','envVarKey':'AUTH_DELIVERY_SECRET'}},
          {'key':'AUTH_DELIVERY_ORIGIN','fromService':{'type':'web','name':'onecall-staging-delivery','envVarKey':'RENDER_EXTERNAL_URL'}},
          {'key':'CORS_ORIGINS','fromService':{'type':'web','name':'onecall-web','envVarKey':'RENDER_EXTERNAL_URL'}},
          value('THROTTLE_KEY_PREFIX','onecall:staging:throttle:'),value('ONECALL_UPLOADS_ENABLED','true' if paid else 'false'),value('ONECALL_SOCIAL_LOGIN_ENABLED','false'),value('ONECALL_WALLET_ENABLED','false'),secret('ONECALL_PAYMENT_MODE'),secret('PAYSTACK_SECRET_KEY'),secret('ONECALL_PAYMENTS_LIVE_APPROVED'),value('ONECALL_MIGRATE_ON_START','false' if paid else 'true')]
    }
    if paid:
        api.update({'disk':{'name':'onecall-private-photos','mountPath':'/var/lib/onecall','sizeGB':1},'preDeployCommand':'pnpm prisma:deploy'})
        api['envVars'] += [value('ONECALL_STORAGE_PERSISTENT','true'),value('ONECALL_UPLOAD_ROOT','/var/lib/onecall/private')]
    delivery={
        'type':'web','name':'onecall-staging-delivery','runtime':'docker','region':'frankfurt','plan':'starter' if paid else 'free',
        'branch':'main','dockerfilePath':'./deploy/Dockerfile','dockerContext':'.','dockerCommand':'node scripts/start-auth-delivery.cjs','autoDeployTrigger':'off','healthCheckPath':'/health',
        'envVars':[value('AUTH_DELIVERY_HOST','0.0.0.0'),value('AUTH_DELIVERY_PORT','10000'),{'key':'AUTH_DELIVERY_SECRET','generateValue':True},
          {'key':'AUTH_DELIVERY_REDIS_URL','fromService':{'type':'keyvalue','name':'onecall-staging-cache','property':'connectionString'}},
          value('AUTH_DELIVERY_REDIS_PREFIX','onecall:staging:delivery:'),*[secret(k) for k in ['RESEND_API_KEY','AUTH_EMAIL_FROM','TERMII_API_KEY','TERMII_BASE_URL','TERMII_SENDER_ID']]]
    }
    web = {
        'type':'web','name':'onecall-web','runtime':'static',
        'repo':'https://github.com/AhmadibOfficial/OneCall','branch':'publication-onecall',
        'buildCommand':"echo 'OneCall verified client publication; no server build required'",
        'staticPublishPath':'.','autoDeployTrigger':'off','previews':{'generation':'off'},
        'headers':[
            {'path':'/*','name':'X-Content-Type-Options','value':'nosniff'},
            {'path':'/*','name':'Referrer-Policy','value':'strict-origin-when-cross-origin'},
            {'path':'/index.html','name':'Cache-Control','value':'no-cache'},
        ],
    }
    resources = {
        'name':'pilot',
        'services':[api,delivery,web,{'type':'keyvalue','name':'onecall-staging-cache','region':'frankfurt','plan':'starter' if paid else 'free','maxmemoryPolicy':'noeviction','ipAllowList':[]}],
        'databases':[{'name':'onecall-staging-db','region':'frankfurt','plan':'basic-256mb' if paid else 'free','postgresMajorVersion':'16','databaseName':'onecall_staging','user':'onecall_staging','ipAllowList':[]}],
    }
    return {'previews':{'generation':'off'},'projects':[{'name':'OneCall','environments':[resources]}]}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--paid-staging',action='store_true');p.add_argument('--output',type=Path,default=Path('render.yaml'));args=p.parse_args()
    if args.output.exists():raise SystemExit('Output already exists; preserve or choose another path.')
    args.output.write_text('# Draft only: review in Render before provisioning.\n'+yaml.safe_dump(blueprint(args.paid_staging),sort_keys=False))
    print('Prepared persistent paid staging draft.' if args.paid_staging else 'Prepared free preview; photo uploads disabled.')
if __name__=='__main__':main()
