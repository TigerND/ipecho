
FROM teego/node:latest

MAINTAINER Aleksandr Zykov <tiger@vilijavis.lt>

ENV NODE_ENV production

RUN ( \
        apt-get install -qy --no-install-recommends \
            nginx-full \
            geoip-database \
            geoip-database-extra \
    ) && \
    apt-get clean -qy

ENV BUILDBASE /r

ADD . $BUILDBASE/app

RUN cd $BUILDBASE/app &&\
    ( \
        npm install \
    )

#
# docker run --rm -it -w /r/app ipecho
# docker create --name ipecho -p 7634:8080 -w /r/app ipecho
#
CMD ["node", "ipecho.js", "--config", "/r/app/config"]