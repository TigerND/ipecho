
FROM teego/node:latest

MAINTAINER Aleksandr Zykov <tiger@vilijavis.lt>

ENV NODE_ENV production

ENV BUILDBASE /r

ADD . $BUILDBASE/app

RUN cd $BUILDBASE/app &&\
    ( \
        npm install \
    )

#
# docker run --rm -it -w /r/app ipecho
#
CMD ["npm", "start"]